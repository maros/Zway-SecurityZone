/*** SecurityZone Z-Way HA module *******************************************

Version: 1.06
(c) Maroš Kollár, 2015
-----------------------------------------------------------------------------
Author: Maroš Kollár <maros@k-1.com>
Description:
    Group security devices in zones. Emits events if sensors are tripped,
    which can be processed by co-operative plugins.

******************************************************************************/

function SecurityZone (id, controller) {
    // Call superconstructor first (AutomationModule)
    SecurityZone.super_.call(this, id, controller);
    
    this.delayAlarmTimeout      = undefined;
    this.delayActivateTimeout   = undefined;
    this.timeout                = undefined;
    this.callback               = undefined;
    this.icon                   = undefined;
    this.langFile               = undefined;
}

inherits(SecurityZone, BaseModule);

_module = SecurityZone;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

/**
 * Static list of all available alarm types
 */
SecurityZone.prototype.types = [
    "intrusion", "flood", "smoke", "gas", "heat", "cold", "tamper", "energy", "other"
];

/**
 * Static list of all available events
 */
SecurityZone.prototype.events = [
    _.flatten(
        _.map(
            SecurityZone.prototype.types, 
            function(type){ 
                return [
                    'security.'+type+'.delayAlarm',
                    'security.'+type+'.delayCancel',
                    'security.'+type+'.alarm',
                    'security.'+type+'.stop',
                    'security.'+type+'.warning',
                ]; 
            }
        )
    )
];

SecurityZone.prototype.init = function (config) {
    SecurityZone.super_.prototype.init.call(this, config);
    var self = this;
    
    self.icon = 'on';
    self.vDev = this.controller.devices.create({
        deviceId: "SecurityZone_"+this.id,
        defaults: {
            metrics: {
                triggeredDevices: [],
                level: 'off',
                state: 'off',
                title: self.langFile.m_title+' '+self.langFile['type_'+self.config.type],
                icon: "/ZAutomation/api/v1/load/modulemedia/SecurityZone/icon.png"
            }
        },
        overlay: {
            metrics: {
                securityType: self.config.type
            },
            probeType: 'SecurityZone',
            deviceType: 'switchBinary'
        },
        handler: function(command, args) {
            if (command !== 'on'
                && command !== 'off') {
                return;
            }
            self.setState(command);
        },
        moduleId: this.id
    });
    
    //self.setState(this.vDev.get('metrics:level'));
    
    self.callback  = _.bind(self.checkAlarm,self);
    
    var state = this.vDev.get('metrics:state');
    if (state === 'delayActivate') {
        self.log('Restart activation delay');
        self.startDelayActivate();
    } else if (state === 'delayAlarm') {
        self.log('Restart alarm delay');
        self.startDelayAlarm();
    }
    
    setTimeout(_.bind(self.initCallback,self),12000);
};

SecurityZone.prototype.initCallback = function() {
    var self = this;
    
    self.tests = {};
    
    _.each(self.config.tests,function(test) {
        if (test.testType === "binary") {
            self.attach(test.testBinary);
        } else if (test.testType === "multilevel") {
            self.attach(test.testMultilevel);
        } else if (test.testType === "remote") {
            self.attach(test.testRemote);
        }
    });
};

SecurityZone.prototype.stop = function () {
    var self = this;
    
    if (this.vDev) {
        this.controller.devices.remove(this.vDev.id);
        this.vDev = undefined;
    }
    
    _.each(self.config.tests,function(test) {
        if (test.testType === "binary") {
            self.detach(test.testBinary);
        } else if (test.testType === "multilevel") {
            self.detach(test.testMultilevel);
        } else if (test.testType === "remote") {
            self.detach(test.testRemote);
        }
    });

    self.callback = undefined;
    
    self.stopTimeout();
    self.stopDelayAlarm();
    self.stopDelayActivate();

    SecurityZone.super_.prototype.stop.call(this);
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

/**
 * Attach events watchers to a device
 * @param {object} test - A test rule
 */
SecurityZone.prototype.attach = function (test) {
    var self        = this;
    self.controller.devices.on(test.device, "modify:metrics:level", self.callback);
    //self.controller.devices.on(test.device, "modify:metrics:change", self.callback);
};

/**
 * Detach events watchers from a device
 * @param {object} test - A test rule
 */
SecurityZone.prototype.detach = function(test) {
    var self        = this;
    self.controller.devices.off(test.device, "modify:metrics:level", self.callback);
    //self.controller.devices.off(test.device, "modify:metrics:change", self.callback);
};

/**
 * Emit an event
 * @param {string} event - Event type
 */
SecurityZone.prototype.callEvent = function(event,message) {
    var self        = this;
    var type        = self.config.type;
    if (type === 'other')
        type        = self.config.otherType || type;
    
    var fullEvent = "security."+type+'.'+event;
    var params = {
        id:         self.id,
        title:      self.vDev.get('metrics:title'),
        location:   self.vDev.get('metrics:location'),
        //cancelable: self.config.cancelable,
        type:       type,
        delay:      self.config.delayAlarm,
        event:      event,
        message:    message
    };
    
    self.log('Emit '+fullEvent);
    self.controller.emit(fullEvent,params);
};

/**
 * Stops alarm timeout if any
 */
SecurityZone.prototype.stopTimeout = function() {
    var self        = this;
    if (typeof(self.timeout) !== 'undefined') {
        clearTimeout(self.timeout);
        self.timeout = undefined;
    }
};

/**
 * Stops delayed alarm timeout if any
 */
SecurityZone.prototype.stopDelayAlarm = function () {
    var self = this;
    if (typeof(self.delayAlarmTimeout) !== 'undefined') {
        clearTimeout(self.delayAlarmTimeout);
        self.delayAlarmTimeout = undefined;
    }
};

/**
 * Stops delayed activation timeout if any
 */
SecurityZone.prototype.stopDelayActivate = function () {
    var self = this;
    if (typeof(self.delayActivateTimeout) !== 'undefined') {
        clearTimeout(self.delayActivateTimeout);
        self.delayActivateTimeout = undefined;
    }
};

/**
 * Starts a delayed alarm
 */
SecurityZone.prototype.startDelayAlarm = function () {
    var self            = this;
    var dateNow         = (new Date()).getTime();
    var delayRelative   = self.config.delayAlarm;
    var delayAlarm      = self.vDev.get('metrics:delayAlarm');
    
    self.stopDelayAlarm();
    
    if (typeof(delayAlarm) === 'number') {
        if (dateNow >= delayAlarm) {
            self.setState('alarm',true);
            self.vDev.set('metrics:delayAlarm',null);
            return;
        } else {
            delayRelative = delayAlarm - dateNow;
        }
    } else {
        delayAlarm = dateNow + self.config.delayAlarm;
        self.vDev.set('metrics:delayAlarm',delayAlarm);
    }
    
    self.delayAlarmTimeout = setTimeout(
        _.bind(
            self.setState,
            self,
            'alarm',
            true
        ),
        (delayRelative * 1000) 
    );
};

/**
 * Starts delayed activation
 */
SecurityZone.prototype.startDelayActivate = function () {
    var self            = this;
    var dateNow         = (new Date()).getTime();
    var delayRelative   = self.config.delayActivate;
    var delayActivate   = self.vDev.get('metrics:delayActivate');
    
    self.stopDelayActivate();
    
    if (typeof(delayActivate) === 'number') {
        self.log('Restart');
        if (dateNow >= delayActivate) {
            self.setState('on',true);
            self.vDev.set('metrics:delayActivate',null);
            return;
        } else {
            delayRelative = delayActivate - dateNow;
        }
    } else {
        self.log('Set');
        delayActivate = dateNow + self.config.delayActivate;
        self.vDev.set('metrics:delayActivate',delayActivate);
    }
    
    self.delayActivateTimeout = setTimeout(
        _.bind(
            self.setState,
            self,
            'on',
            true
        ),
        (delayRelative * 1000) 
    );
};

/**
 * Sets new alarm state
 * @param {string} newState - New state to be set
 * @param {boolean} timer - Indicates if method was called from a timer (true)
 * or not (false, default)
 */
SecurityZone.prototype.setState = function (newState,timer) {
    var self        = this;
    timer           = timer || false;
    level           = self.vDev.get("metrics:level");
    var state       = self.vDev.get('metrics:state');
    var cleanup     = false;
    var message;
    
    // Turn off from handler
    if (newState === 'off') {
        if (state == 'delayAlarm') {
            self.callEvent('delayCancel');
        } else if (state == 'alarm') {
            self.callEvent('stop');
        }
        self.stopDelayActivate();
        self.stopDelayAlarm();
        self.icon = 'off';
        self.log('Disarm zone '+self.id);
        self.vDev.set('metrics:delayActivate',null);
        self.vDev.set('metrics:delayAlarm',null);
        self.vDev.set('metrics:triggeredDevcies',[]);
        self.vDev.set('metrics:level', 'off');
        state = 'off';
    // Turn on delayed from handler
    } else if (newState === 'on'
        && state === 'off'
        && self.config.delayActivate > 0) {
        self.icon = 'delayActivate';
        self.checkActivate('immediate');
        self.log('Delayed arming zone '+self.id);
        self.vDev.set('metrics:delayActivate',null);
        self.vDev.set('metrics:delayAlarm',null);
        state = 'delayActivate';
        self.startDelayActivate();
    // Turn on from handler
    } else if (newState === 'on'
        && (state === 'off' || (state === 'delayActivate' && timer === true))) {
        self.icon = 'on';
        // TODO check security zone and notify
        self.log('Arm zone '+self.id);
        self.vDev.set('metrics:level','on');
        self.vDev.set('metrics:delayActivate',null);
        self.vDev.set('metrics:delayAlarm',null);
        if (self.config.delayActivate === 0) {
            self.checkActivate('immediate');
        }
        self.checkActivate('delayed');
        state = 'on';
    // Delayed alarm run 
    } else if (newState === 'alarm'
        && state === 'on'
        && self.config.delayAlarm > 0) {
        self.log('Delayed alarm');
        self.icon = 'delayAlarm';
        state = 'delayAlarm';
        message = self.getMessage('alarm_notification',self.vDev.get('metrics:triggeredDevcies'));
        self.vDev.set('metrics:delayActivate',null);
        self.vDev.set('metrics:delayAlarm',null);
        self.callEvent('delayAlarm',message);
        self.startDelayAlarm();
    // Immediate alarm
    } else if (newState === 'alarm'
        && (state === 'on' || (state === 'delayAlarm' && timer === true))) {
        self.log('Alarm');
        self.icon = 'alarm';
        state = 'alarm';
        message = self.getMessage('alarm_notification',self.vDev.get('metrics:triggeredDevcies'));
        self.vDev.set('metrics:delayActivate',null);
        self.vDev.set('metrics:delayAlarm',null);
        self.callEvent('alarm',message);
        
        // Send Notification
        self.controller.addNotification(
            "warning", 
            message,
            "module", 
            "SecurityZone"
        );
        
        var triggered = self.testsRules();
        if (triggered === false) {
            setTimeout(self.callback,1000*5);
        }
    // Stop alarm, no timeout
    } else if (newState === 'stop' 
        && state === 'alarm'
        && self.config.timeout === 0) {
        self.log('Stop alarm');
        self.icon = level;
        state = level;
        self.callEvent('stop');
    // Start timeout
    } else if (newState === 'stop'
        && state === 'alarm') {
        self.log('Timeout alarm');
        self.icon = 'alarm';
        state = 'timeout';
        self.timeout = setTimeout(
            _.bind(
                self.setState,
                self,
                'stop',
                true
            ),
            (self.config.timeout * 1000)
        );
    // Stop alarm after timeout
    } else if (newState === 'stop'
        && state === 'timeout' 
        && timer === true) {
        self.log('Stop alarm');
        self.icon = level;
        state = level;
        self.callEvent('stop');
        self.stopTimeout();
    // Stop cancelable delayed alarm
    } else if (newState === 'stop'
        && state === 'delayAlarm'
        && self.config.cancelable === true) {
        self.log('Cancel delayed alarm');
        self.stopDelayAlarm();
        self.icon = level;
        state = level;
        self.callEvent('delayCancel');
    // New alarm during timeout
    } else if (newState === 'alarm'
        && state === 'timeout') {
        self.log('Restart alarm');
        self.stopTimeout();
        self.icon = 'alarm';
        state = 'alarm';
    // Nothing matches
    } else {
        return;
    }
    
    self.vDev.set("metrics:state", state);
    self.vDev.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/SecurityZone/icon_"+self.config.type+"_"+self.icon+".png");
};

SecurityZone.prototype.getMessage = function(langKey,devices) {
    var self = this;
    
    var notification = self.langFile[langKey];
    notification = notification.replace('[TYPE]',self.langFile['type_'+self.config.type]);
    notification = notification.replace('[ZONE]',self.vDev.get('metrics:title'));
    notification = notification.replace('[STATE]',self.vDev.get('metrics:state'));
    notification = notification.replace('[DEVICES]',devices.join(', '));
    
    return notification;
};

/**
 * Tests alarm rules
 */
SecurityZone.prototype.checkAlarm = function () {
    var self = this;
    
    var triggered = self.testsRules();
    
    // New alarm
    if (triggered === true) {
        self.setState('alarm');
    // End alarm
    } else if (triggered === false) {
        self.setState('stop');
    }
};

SecurityZone.prototype.checkActivate = function(mode) {
    var self = this;
    
    self.vDev.set('metrics:triggeredDevcies',[]);
    var devices = self.processRules(mode);
    if (devices.length) {
        var message = self.getMessage('activate_triggered',devices);
        self.callEvent('warning',message);
        self.controller.addNotification(
            "warning", 
            message,
            "module", 
            "SecurityZone"
        );
    }
};

SecurityZone.prototype.processRules = function(check) {
    var self    = this;
    var devices = [];
    
    _.each(self.config.tests,function(test) {
        var deviceId,testOperator,testValue,testCheck;
        var testTrigger     = false;
        var comapreKey      = 'level';
        
        if (test.testType === "multilevel") {
            deviceId        = test.testMultilevel.device;
            testOperator    = test.testMultilevel.testOperator;
            testValue       = test.testMultilevel.testValue;
            testCheck       = test.testMultilevel.check;
        } else if (test.testType === "binary") {
            deviceId        = test.testBinary.device;
            testOperator    = '=';
            testValue       = test.testBinary.testValue;
            testCheck       = test.testMultilevel.check;
        } else if (test.testType === "remote") {
            deviceId        = test.testRemote.device;
            testOperator    = '=';
            testValue       = test.testRemote.testValue;
            testCheck       = 'never';
            if (_.contains(["upstart", "upstop", "downstart", "downstop"], test.testRemote.testValue)) {
                comapreKey  = 'change';
            }
        } else {
            self.error('Inavlid test type');
            return;
        }
        
        testCheck = testCheck || 'delayed';
        
        // Skip checks that do not match phase
        if (typeof(check) !== 'undefined'
            && testCheck !== check) {
            return;
        }
        
        var deviceObject    = self.controller.devices.get(deviceId);
        if (deviceObject === null) {
            self.error('Could not find device '+deviceId);
            return;
        }
        
        var comapreValue    = deviceObject.get('metrics:'+comapreKey);
        if (! self.op(comapreValue,testOperator,testValue)) {
            return;
        }
        
        testTrigger         = true;
        var location        = deviceObject.get('location');
        var room            = _.find(
            self.controller.locations, 
            function(item){ return (item.id === location); }
        );
        
        var message         = deviceObject.get('metrics:title');
        if (typeof(room) === 'object') {
            message = message + ' (' + room.title + ')';
        }
        devices.push(message);
        
        self.log('Triggered test from '+deviceObject.get('metrics:title')+' ('+deviceId+')');
    });
    
    return devices;
};

SecurityZone.prototype.testsRules = function() {
    var self = this;
    
    var triggered   = false;
    var devices     = self.processRules();
    
    if (typeof(self.config.testThreshold) === 'number') {
        if (devices.length >= self.config.testThreshold)
        triggered = true;
    } else if (testCount > 0) {
        triggered = true;
    }
    
    if (triggered) {
        self.vDev.set('metrics:triggeredDevcies',devices);
    }
    
    return triggered;
};

SecurityZone.prototype.op = function (dval, op, val) {
    if (op === "=") {
        return dval === val;
    } else if (op === "!=") {
        return dval !== val;
    } else if (op === ">") {
        return dval > val;
    } else if (op === "<") {
        return dval < val;
    } else if (op === ">=") {
        return dval >= val;
    } else if (op === "<=") {
        return dval <= val;
    }
        
    return null; // error!!  
};


 
