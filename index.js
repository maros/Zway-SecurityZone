/*** SecurityZone Z-Way HA module *******************************************

Version: 1.13
(c) Maroš Kollár, 2015-2017
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
    this.type                   = undefined;
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

    self.type = (self.config.type == 'other') ? self.config.otherType: self.config.type;
    self.icon = 'on';
    self.vDev = this.controller.devices.create({
        deviceId: "SecurityZone_"+this.id,
        defaults: {
            metrics: {
                triggeredDevices: [],
                level: 'off',
                state: 'off',
                title: self.langFile.m_title+' '+self.langFile['type_'+self.config.type],
                icon: self.imagePath+"/icon.png"
            }
        },
        overlay: {
            metrics: {
                securityType: self.type
            },
            probeType: 'controller_security',
            deviceType: 'switchBinary'
        },
        handler: function(command, args) {
            if (command !== 'on'
                && command !== 'off') {
                return;
            }
            self.changeState(command);
        },
        moduleId: this.id
    });

    //self.changeState(this.vDev.get('metrics:level'));

    self.callback = _.bind(self.checkAlarm,self);

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
    var self = this;
    var fullEvent = 'security.'+self.type+'.'+event;
    self.log('Calling event '+fullEvent);
    var params = {
        id:         self.id,
        title:      self.vDev.get('metrics:title'),
        location:   self.vDev.get('metrics:location'),
        devices:    self.vDev.get('metrics:triggeredDevcies'),
        //cancelable: self.config.cancelable,
        type:       self.type,
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
            self.changeState('alarm',true);
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
            self.changeState,
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
        self.log('Restart delayed activation');
        if (dateNow >= delayActivate) {
            self.changeState('on',true);
            self.vDev.set('metrics:delayActivate',null);
            return;
        } else {
            delayRelative = delayActivate - dateNow;
        }
    } else {
        self.log('Set activation delay');
        delayActivate = dateNow + self.config.delayActivate;
        self.vDev.set('metrics:delayActivate',delayActivate);
    }

    self.delayActivateTimeout = setTimeout(
        _.bind(
            self.changeState,
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
SecurityZone.prototype.changeState = function (newState,timer) {
    var self        = this;
    timer           = timer || false;
    level           = self.vDev.get("metrics:level");
    var state       = self.vDev.get('metrics:state');
    var cleanup     = false;
    var message;

    // Turn off from handler
    if (newState === 'off') {
        self.stopDelayActivate();
        self.stopDelayAlarm();
        self.setState({
            'state': 'off',
            'triggeredDevcies': [],
            'delayActivate': null,
            'delayAlarm': null
        });
        if (state == 'delayAlarm') {
            self.callEvent('delayCancel');
        } else if (state == 'alarm') {
            self.callEvent('stop');
        }
        self.log('Disarm zone '+self.id);
    // Turn on delayed from handler
    } else if (newState === 'on'
        && state === 'off'
        && self.config.delayActivate > 0) {
        self.log('State change: Delayed arming zone '+self.id);
        self.setState({
            'state': 'delayActivate',
            'delayActivate': null,
            'delayAlarm': null
        });
        self.startDelayActivate();
        self.checkActivate(['immediate']);
    // Turn on from handler (either immediate or after delay)
    } else if (newState === 'on'
        && (state === 'off' || (state === 'delayActivate' && timer === true))) {
        self.log('Invoking arm zone '+self.id);
        if (state === 'delayActivate' && timer === true) {
            self.checkActivate(['delayed']);
        } else {
            self.checkActivate(['immediate','delayed']);
        }
        self.setState({
            'state': 'on',
            'delayActivate': null,
            'delayAlarm': null
        });
    // Delayed alarm run
    } else if (newState === 'alarm'
        && state === 'on'
        && self.config.delayAlarm > 0) {
        self.log('State change: Delayed alarm');

        if (! self.checkOtherZones() )
            return;

        message = self.getMessage('alarm_notification',self.vDev.get('metrics:triggeredDevcies'));
        self.setState({
            'state': 'delayAlarm',
            'delayActivate': null,
            'delayAlarm': null
        });
        self.callEvent('delayAlarm',message);
        self.startDelayAlarm();
    // Alarm (either immediate or after delay)
    } else if (newState === 'alarm'
        && (state === 'on' || (state === 'delayAlarm' && timer === true))) {
        self.log('State change: Alarm');

        if (! self.checkOtherZones() )
            return;

        self.setState({
            'delayActivate': null,
            'delayAlarm': null,
            'state': 'alarm'
        });
        message = self.getMessage('alarm_notification',self.vDev.get('metrics:triggeredDevcies'));
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
    // Stop alarm (either immediate or after timeout)
    } else if (newState === 'stop'
        && (
            (state === 'alarm' && self.config.timeout === 0)
            || (state === 'timeout' && timer === true)
        )) {
        self.log('State change: Stop alarm');
        self.stopTimeout();
        self.setState({ 'state': level});
        self.callEvent('stop');

    // Stop alarm timeout
    } else if (newState === 'stop'
        && state === 'alarm'
        && self.config.timeout > 0) {
        self.log('State change: Timeout alarm');
        self.setState({ 'state': 'timeout', 'icon': 'alarm' });
        self.timeout = setTimeout(
            _.bind(
                self.changeState,
                self,
                'stop',
                true
            ),
            (self.config.timeout * 1000)
        );

    // Stop cancelable delayed alarm
    } else if (newState === 'stop'
        && state === 'delayAlarm'
        && self.config.cancelable === true) {
        self.log('State change: Cancel delayed alarm');
        self.stopDelayAlarm();
        self.setState({ 'state': level });
        self.callEvent('delayCancel');
    // New alarm during timeout
    } else if (newState === 'alarm'
        && state === 'timeout') {
        self.log('State change: Restart alarm');
        self.stopTimeout();
        self.setState({ 'state': 'alarm' });
    // Nothing matches
    } else {
        return;
    }
};

SecurityZone.prototype.checkOtherZones = function() {
    var self = this;

    if (self.config.singleZone) {
        var otherOk = true;
        self.processDevices([
            ['probeType','=','controller_security'],
            ['metrics:securityType','=',self.type],
            ['id','!=',self.vDev.id],
        ],function(vDev) {

            var state = vDev.get('metrics:state');
            self.log('Check other zone '+vDev.id+' is in '+state);
            if (state === 'alarm' || state === 'timeout' || state === 'delayAlarm') {
                self.log('Other security zone '+vDev.id+' is already active. Ignoring alarm');
                otherOk = false;
            }
        });
        return otherOk;
    }

    return true;
};

SecurityZone.prototype.setState = function(state) {
    var self = this;
    state.icon = state.icon || state.state;

    // Store as object attribute
    self.icon = state.icon;
    state.icon = self.imagePath + "/icon_" + self.config.type + "_" + state.icon + ".png";

    if (state.state === 'on' || state.state === 'off') {
        state.level = state.state;
    }

    _.each(state, function(val, key) {
        self.vDev.set('metrics:'+key,val);
    });
    return;
};

SecurityZone.prototype.getMessage = function(langKey,devices) {
    var self = this;

    var notification = self.langFile[langKey];
    var type = self.config.type === 'other' ? self.config.otherType : self.langFile['type_'+self.config.type];
    notification = notification.replace('[TYPE]',type);
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
        self.changeState('alarm');
    // End alarm
    } else if (triggered === false) {
        self.changeState('stop');
    }
};

SecurityZone.prototype.checkActivate = function(checks) {
    var self = this;

    // Poll all devices
    _.each(self.config.tests,function(test) {
        var deviceId;
        if (test.testType === "multilevel") {
            deviceId = test.testMultilevel.device;
        } else if (test.testType === "binary") {
            deviceId = test.testBinary.device;
        }
        var deviceObject = self.controller.devices.get(deviceId);
        if (deviceObject === null) {
            self.error('Could not find device '+deviceId);
            return;
        }
        deviceObject.performCommand('update');
        if (_.indexOf(checks,test.check) !== -1) {
            return;
        }
    });

    self.vDev.set('metrics:triggeredDevcies',[]);

    setTimeout(function() {
        var devices = self.processRules(checks);
        if (devices.length > 0) {
            var message = self.getMessage('activate_triggered',devices);
            self.callEvent('warning',message);
            self.controller.addNotification(
                "warning",
                message,
                "module",
                "SecurityZone"
            );
        }
    },30 * 1000); // Delay 30 seconds
};

SecurityZone.prototype.processRules = function(checks) {
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
            testCheck       = test.testBinary.check;
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
        if (_.isArray(checks)
            && _.indexOf(checks,testCheck) === -1) {
            return;
        }

        var deviceObject    = self.controller.devices.get(deviceId);
        if (deviceObject === null) {
            self.error('Could not find device '+deviceId);
            return;
        }

        var comapreValue    = deviceObject.get('metrics:'+comapreKey);
        if (! self.compare(comapreValue,testOperator,testValue)) {
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

    if (typeof(self.config.testThreshold) === 'number'
        && self.config.testThreshold > 0) {
        if (devices.length >= self.config.testThreshold) {
            triggered = true;
        }
    } else if (devices.length > 0) {
        triggered = true;
    }

    if (triggered) {
        self.vDev.set('metrics:triggeredDevcies',devices);
    }

    return triggered;
};
