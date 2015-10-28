/*** SecurityZone Z-Way HA module *******************************************

Version: 1.02
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

SecurityZone.prototype.types = [
    "intrusion", "flood", "smoke", "gas", "heat", "cold", "tamper", "other"
];

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
                probeTitle: 'controller',
                level: 'off',
                state: 'off',
                title: self.langFile.title
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
    self.callback   = _.bind(self.testRule,self);
    
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

SecurityZone.prototype.attach = function (test) {
    var self        = this;
    self.controller.devices.on(test.device, "change:metrics:level", self.callback);
    self.controller.devices.on(test.device, "change:metrics:change", self.callback);
};

SecurityZone.prototype.detach = function (test) {
    var self        = this;
    self.controller.devices.off(test.device, "change:metrics:level", self.callback);
    self.controller.devices.off(test.device, "change:metrics:change", self.callback);
};

SecurityZone.prototype.callEvent = function(event) {
    var self        = this;
    
    var fullEvent = "security."+self.config.type+'.'+event;
    
    console.log('[SecurityZone] Emit '+fullEvent);
    self.controller.emit(
        fullEvent, 
        self.vDev.get('metrics:title'),
        self.id
    );
}

SecurityZone.prototype.stopTimeout = function() {
    var self        = this;
    if (typeof(self.timeout) !== 'undefined') {
        clearTimeout(self.timeout);
        self.timeout = undefined;
    }
};

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

SecurityZone.prototype.stopDelayActivate = function () {
    var self        = this;
    if (typeof(self.delayActivate) !== 'undefined') {
        clearTimeout(self.delayActivate);
        self.delayActivate = undefined;
    }
};

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
        self.vDev.set("metrics:level", 'off');
        state = 'off';
    // Turn on delayed from handler
    } else if (newState === 'on'
        && state === 'off'
        && self.config.delay_activate > 0) {
        self.icon = 'delayActivate';
        console.log('[SecurityZone] Delayed arming zone '+self.id);
        state = 'delayActivate';
        self.startDelayActivate();
    // Turn on from handler
    } else if (newState === 'on'
        && (state === 'off' || (state === 'delayActivate' && timer === true))) {
        self.icon = 'on';
        console.log('[SecurityZone] Arm zone '+self.id);
        self.vDev.set("metrics:level", 'on');
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
        self.callEvent('alarm');
        
        // Send Notification
        self.controller.addNotification(
            "warning", 
            self.getMessage('alarm_notification'),
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
    self.vDev.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/SecurityZone/icon_"+self.icon+".png");
};

SecurityZone.prototype.getMessage = function(langKey) {
    var self = this;
    
    var notification = self.langFile[langKey];
    notification = notification.replace('[TYPE]',self.langFile['type_'+self.config.type]);
    notification = notification.replace('[ZONE]',self.vDev.get('metrics:title'));
    notification = notification.replace('[STATE]',self.vDev.get('metrics:state'));
    
    return notification;
}

SecurityZone.prototype.testRule = function () {
    var self = this;
    
    var trigger = false;
    _.each(self.config.tests,function(test) {
        if (test.testType === "multilevel") {
            trigger = trigger || self.op(self.controller.devices.get(test.testMultilevel.device).get("metrics:level"), test.testMultilevel.testOperator, test.testMultilevel.testValue);
        } else if (test.testType === "binary") {
            trigger = trigger || (self.controller.devices.get(test.testBinary.device).get("metrics:level") === test.testBinary.testValue);
        } else if (test.testType === "remote") {
            var dev = self.controller.devices.get(test.testRemote.device);
            trigger = trigger || ((_.contains(["on", "off"], test.testRemote.testValue) && dev.get("metrics:level") === test.testRemote.testValue) || (_.contains(["upstart", "upstop", "downstart", "downstop"], test.testRemote.testValue) && dev.get("metrics:change") === test.testRemote.testValue));
        }
    });
    
    // New alarm
    if (trigger === true) {
        self.setState('alarm');
    // End alarm
    } else if (trigger === false) {
        self.setState('cancel');
    }
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


 
