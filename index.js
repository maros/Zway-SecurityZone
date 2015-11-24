/*** SecurityZone Z-Way HA module *******************************************

Version: 1.03
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
    
    this.delayAlarm     = undefined;
    this.delayActivate  = undefined;
    this.timeout        = undefined;
    this.callback       = undefined;
    this.icon           = undefined;
    this.langFile       = undefined;
}

inherits(SecurityZone, AutomationModule);

_module = SecurityZone;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

/**
 * Static list of all available alarm types
 */
SecurityZone.prototype.types = [
    "intrusion", "flood", "smoke", "gas", "heat", "cold", "tamper", "other"
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
                    'security.'+type+'.delayed_alarm',
                    'security.'+type+'.alarm',
                    'security.'+type+'.cancel',
                ]; 
            }
        )
    )
];

SecurityZone.prototype.init = function (config) {
    SecurityZone.super_.prototype.init.call(this, config);
    
    var self = this;

    self.icon           = 'on';
    self.langFile   = self.controller.loadModuleLang("SecurityZone");
    
    this.vDev = this.controller.devices.create({
        deviceId: "SecurityZone_"+this.id,
        defaults: {
            metrics: {
                triggeredDevices: [],
                probeTitle: 'SecurityZone',
                securityType: self.config.type,
                level: 'off',
                state: 'off',
                title: self.langFile.title+' '+self.langFile['type_'+self.config.type],
                icon: "/ZAutomation/api/v1/load/modulemedia/SecurityZone/icon.png"
            }
        },
        overlay: {
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
    
    self.setState(this.vDev.get('metrics:level'));
    
    var state = this.vDev.get('metrics:state');
    if (state === 'delayActivate') {
        self.startDelayActivate();
    } else if (state === 'delayAlarm') {
        self.startDelayAlarm();
    }
    
    setTimeout(_.bind(self.initCallback,self),12000);
};

SecurityZone.prototype.initCallback = function() {
    var self = this;
    
    self.tests = {};
    self.callback   = _.bind(self.checkAlarm,self);
    
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
    self.controller.devices.on(test.device, "change:metrics:level", self.callback);
    self.controller.devices.on(test.device, "change:metrics:change", self.callback);
};

/**
 * Detach events watchers from a device
 * @param {object} test - A test rule
 */
SecurityZone.prototype.detach = function (test) {
    var self        = this;
    self.controller.devices.off(test.device, "change:metrics:level", self.callback);
    self.controller.devices.off(test.device, "change:metrics:change", self.callback);
};

/**
 * Emit an event
 * @param {string} event - Event type
 */
SecurityZone.prototype.callEvent = function(event,message) {
    var self        = this;
    
    var fullEvent = "security."+self.config.type+'.'+event;
    var params = {
        id:         self.id,
        title:      self.vDev.get('metrics:title'),
        location:   self.vDev.get('metrics:location'),
        type:       self.config.type,
        event:      event,
        message:    message
    };
    
    console.log('[SecurityZone] Emit '+fullEvent);
    self.controller.emit(fullEvent,params);
}

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
    var self        = this;
    if (typeof(self.delayAlarm) !== 'undefined') {
        clearTimeout(self.delayAlarm);
        self.delayAlarm = undefined;
        if (self.vDev.get('metrics:state')  === 'delayAlarm') {
            self.callEvent('cancel');
        }
    }
};

/**
 * Stops delayed activation timeout if any
 */
SecurityZone.prototype.stopDelayActivate = function () {
    var self        = this;
    if (typeof(self.delayActivate) !== 'undefined') {
        clearTimeout(self.delayActivate);
        self.delayActivate = undefined;
    }
};

/**
 * Starts a delayed alarm
 */
SecurityZone.prototype.startDelayAlarm = function () {
    var self        = this;
    self.stopDelayAlarm();
    self.delayAlarm = setTimeout(
        _.bind(
            self.setState,
            self,
            'alarm',
            true
        ),
        (self.config.delay_alarm * 1000) // TODO calculate correct timeout on resume
    );
};

/**
 * Starts delayed activation
 */
SecurityZone.prototype.startDelayActivate = function () {
    var self        = this;
    self.stopDelayActivate();
    self.delayActivate = setTimeout(
        _.bind(
            self.setState,
            self,
            'on',
            true
        ),
        (self.config.delay_activate * 1000) 
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
    
    // Turn off from handler
    if (newState === 'off') {
        if (state !== 'on' && state !== 'off') {
            self.callEvent('cancel');
        }
        self.stopDelayActivate();
        self.stopDelayAlarm();
        self.icon = 'off';
        console.log('[SecurityZone] Disarm zone '+self.id);
        self.vDev.set('metrics:triggeredDevcies',[]);
        self.vDev.set("metrics:level", 'off');
        state = 'off';
    // Turn on delayed from handler
    } else if (newState === 'on'
        && state === 'off'
        && self.config.delay_activate > 0) {
        self.icon = 'delayActivate';
        self.checkActivate();
        console.log('[SecurityZone] Delayed arming zone '+self.id);
        state = 'delayActivate';
        self.startDelayActivate();
    // Turn on from handler
    } else if (newState === 'on'
        && (state === 'off' || (state === 'delayActivate' && timer === true))) {
        self.icon = 'on';
        // TODO check security zone and notify
        console.log('[SecurityZone] Arm zone '+self.id);
        self.vDev.set("metrics:level", 'on');
        if (state === 'off') {
            self.checkActivate();
        }
        state = 'on';
    // Delayed alarm run 
    } else if (newState === 'alarm'
        && state === 'on'
        && self.config.delay_alarm > 0) {
        self.icon = 'delayAlarm';
        state = 'delayAlarm';
        self.callEvent('delayed_alarm');
        self.startDelayAlarm();
        console.log('[SecurityZone] Delayed alarm in zone '+self.id);
    // Immediate alarm
    } else if (newState === 'alarm'
        && (state === 'on' || (state === 'delayAlarm' && timer === true))) {
        self.icon = 'alarm';
        state = 'alarm';
        var message = self.getMessage('alarm_notification');
        self.callEvent('alarm',message);
        
        // Send Notification
        self.controller.addNotification(
            "warning", 
            message,
            "module", 
            "SecurityZone"
        );
        console.log('[SecurityZone] Alarm in zone '+self.id);
    // Cancel alarm, no timeout
    } else if (newState === 'cancel' 
        && state === 'alarm'
        && self.config.timeout === 0) {
        self.icon = level;
        state = level;
        self.callEvent('cancel');
        console.log('[SecurityZone] Cancel alarm in zone '+self.id);
    // Start timeout
    } else if (newState === 'cancel'
        && state === 'alarm') {
        self.icon = 'alarm';
        state = 'timeout';
        self.timeout = setTimeout(
            _.bind(
                self.setState,
                self,
                'cancel',
                true
            ),
            (self.config.timeout * 1000)
        );
        console.log('[SecurityZone] Timeout alarm in zone '+self.id);
    // Cancel alarm after timeout
    } else if (newState === 'cancel'
        && state === 'timeout' 
        && timer === true) {
        self.icon = level;
        state = level;
        self.callEvent('cancel');
        self.stopTimeout();
        console.log('[SecurityZone] Cancel alarm in zone '+self.id);
    // New alarm during timeout
    } else if (newState === 'alarm'
        && state === 'timeout') {
        self.stopTimeout();
        self.icon = 'alarm';
        state = 'alarm';
        console.log('[SecurityZone] Restart alarm in zone '+self.id);
    // Nothing matches
    } else {
        return;
    }
    
    self.vDev.set("metrics:state", state);
    self.vDev.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/SecurityZone/icon_"+self.config.type+"_"+self.icon+".png");
};

SecurityZone.prototype.getMessage = function(langKey) {
    var self = this;
    
    var notification = self.langFile[langKey];
    notification = notification.replace('[TYPE]',self.langFile['type_'+self.config.type]);
    notification = notification.replace('[ZONE]',self.vDev.get('metrics:title'));
    notification = notification.replace('[STATE]',self.vDev.get('metrics:state'));
    notification = notification.replace('[DEVICES]',self.vDev.get('metrics:triggeredDevcies').join(', '));
    
    return notification;
}

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
        self.setState('cancel');
    }
};

SecurityZone.prototype.checkActivate = function() {
    var self = this;
    
    self.vDev.set('metrics:triggeredDevcies',[]);
    var triggered = self.testsRules();
    if (triggered) {
        self.controller.addNotification(
            "warning", 
            self.getMessage('activate_triggered'),
            "module", 
            "SecurityZone"
        );
    }
};

SecurityZone.prototype.testsRules = function() {
    var self = this;
    
    var triggered   = false;
    var devices     = [];
    _.each(self.config.tests,function(test) {
        var testTrigger     = false;
        var deviceId        = undefined;
        var testOperator    = undefined;
        var testValue       = undefined;
        var comapreKey      = 'level';
        
        if (test.testType === "multilevel") {
            deviceId        = test.testMultilevel.device;
            testOperator    = test.testMultilevel.testOperator;
            testValue       = test.testMultilevel.testValue;
        } else if (test.testType === "binary") {
            deviceId        = test.testBinary.device;
            testOperator    = '=';
            testValue       = test.testBinary.testValue;
        } else if (test.testType === "remote") {
            deviceObject    = test.testRemote.device;
            testOperator    = '=';
            testValue       = test.testRemote.testValue;
            if (_.contains(["upstart", "upstop", "downstart", "downstop"], test.testRemote.testValue)) {
                comapreKey  = 'change';
            }
        } else {
            console.error('[SecurityZone] Inavlid test type');
            return;
        }
        
        var deviceObject    = self.controller.devices.get(deviceId);
        if (deviceObject === null) {
            console.error('[SecurityZone] Could not find device '+deviceId);
            return;
        }
        
        var comapreValue    = deviceObject.get('metrics:'+comapreKey);
        if (! self.op(testValue,testOperator,comapreValue)) {
            return;
        }
        
        testTrigger         = true;
        var location        = deviceObject.get('location');
        var room            = _.find(
            self.controller.locations, 
            function(item){ return (item.id === location) }
        );
        
        var message         = deviceObject.get('metrics:title');
        if (typeof(room) === 'object') {
            message = message + ' (' + room.title + ')';
        }
        devices.push(message);
        
        triggered = true;
    });
    
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


 
