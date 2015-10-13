/*** SecurityZone Z-Way HA module *******************************************

Version: 1.0.0
(c) Maroš Kollár, 2015
-----------------------------------------------------------------------------
Author: maros@k-1.com <maros@k-1.com>
Description:
    Group security devices in zones. 

******************************************************************************/

function SecurityZone (id, controller) {
    // Call superconstructor first (AutomationModule)
    SecurityZone.super_.call(this, id, controller);
}

inherits(SecurityZone, AutomationModule);

_module = SecurityZone;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

SecurityZone.prototype.events = [
    'security.delayed_alarm',
    'security.alarm',
    'security.cancel'
];

SecurityZone.prototype.init = function (config) {
    SecurityZone.super_.prototype.init.call(this, config);
    
    var self = this;
    
    var langFile        = self.controller.loadModuleLang("SecurityZone");
    self.delay          = null;
    self.timeout        = null;
    self.callback       = null;
    self.icon           = 'on';
    self.state          = 'on'; // TODO init state
    
    this.vDev = this.controller.devices.create({
        deviceId: "SecurityZone_"+this.id,
        defaults: {
            deviceType: "switchBinary",
            metrics: {
                level:  self.state
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
    
    self.setState(self.state);
};

SecurityZone.prototype.stop = function () {
    var self = this;
    
    if (this.vDev) {
        this.controller.devices.remove(this.vDev.id);
        this.vDev = null;
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

    self.callback = null;
    
    self.stopTimeout();
    self.stopDelay();

    // TODO disable alarm delay
    // TODO disable timer
    
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

SecurityZone.prototype.callEvent = function(type) {
    var self        = this;
    self.controller.emit("security."+type, {
        type: self.config.type,
        source: self.id
    });
}

SecurityZone.prototype.stopTimeout = function() {
    var self        = this;
    if (typeof(self.timeout) !== 'null') {
        clearTimeout(self.timeout);
        self.timeout = null;
    }
};

SecurityZone.prototype.stopDelay = function () {
    var self        = this;
    if (typeof(self.delay) !== 'null') {
        clearTimeout(self.delay);
        self.delay = null;
        if (self.state === 'delay') {
            self.callEvent('cancel');
        }
    }
};

SecurityZone.prototype.setState = function (newState,timer) {
    var self        = this;
    timer           = timer || false;
    level           = self.vDev.get("metrics:level");
    
    // Turn off alarm from handler
    if (newState === 'off') {
        self.stopDelay();
        self.state = 'off';
        self.icon = 'off';
        self.vDev.set("metrics:level", 'off');
    // Turn on alarm from handler
    } else if (newState === 'on'
        && self.state === 'off') {
        self.state = 'on';
        self.icon = 'on';
        self.vDev.set("metrics:level", 'on');
    // Delayed alarm run 
    } else if (newState === 'alarm'
        && self.state === 'on'
        && self.config.delay > 0) {
        self.icon = 'alarm';
        self.state = 'delay';
        self.callEvent('delayed_alarm');
        self.delay = setTimeout(
            _.bind(
                self.setState,
                self,
                'alarm',
                true
            ),
            (self.config.delay * 1000)
        );
    // Imideate alarm
    } else if (newState === 'alarm'
        && (self.state === 'on' || (self.state === 'delay' && timer === true))) {
        self.icon = 'alarm';
        self.state = 'alarm';
        self.callEvent('alarm');
        
        // Send Notification
        self.controller.addNotification(
            "warning", 
            "TODO", 
            "module", 
            "SecurityZone"
        );

    // Cancel alarm, no timeout
    } else if (newState === 'cancel' 
        && self.state === 'alarm'
        && self.config.timeout === 0) {
        self.icon = level;
        self.state = level;
        self.callEvent('cancel');
    // Start timeout
    } else if (newState === 'cancel'
        && self.state === 'alarm') {
        self.state = 'timeout';
        self.timeout = setTimeout(
            _.bind(
                self.setState,
                self,
                'cancel',
                true
            ),
            (self.config.timeout * 1000)
        );
    // Cancel alarm after timeout
    } else if (newState === 'cancel'
        && self.state = 'timeout' 
        && timer === true) {
        self.icon = level;
        self.state = level;
        self.callEvent('cancel');
        self.stopTimeout();
    // New alarm during timeout
    } else if (newState === 'alarm'
        && self.state = 'timeout') {
        self.stopTimeout();
        self.state = 'alarm';
    // Nothing matches
    } else {
        return;
    }
    
    self.vDev.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/SecurityZone/icon_"+self.icon+".png");
};

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

SecurityMode.prototype.op = function (dval, op, val) {
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


 
