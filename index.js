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
    'security.timeout',
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
    self.mode           = 'on'; // TODO init state
    
    this.vDev = this.controller.devices.create({
        deviceId: "SecurityZone_"+this.id,
        defaults: {
            deviceType: "switchBinary",
            metrics: {
                level:  self.mode
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

SecurityZone.prototype.stopTimeout = function() {
    var self        = this;
    if (typeof(self.timeout) !== 'null') {
        clearTimeout(self.timeout);
        self.timeout = null;
        self.controller.emit("security.cancel", {
            type: self.config.type            
        });

    }
};

SecurityZone.prototype.stopDelay = function () {
    var self        = this;
    if (typeof(self.delay) !== 'null') {
        clearTimeout(self.delay);
        self.delay = null;
        self.controller.emit("security.cancel", {
            type: self.config.type            
        });
    }
};

SecurityZone.prototype.setState = function (state) {
    var self        = this;
    
    if (state === 'off') {
        self.stopTimeout();
        self.stopDelay();
        self.mode = 'off';
        self.vDev.set("metrics:level", 'off');

        // TODO disable alarm delay
        // TODO disable timer
        // TODO reset mode
        // TODO emit event
    } else if (state === 'alarm') {
        // TODO
    } else if (state === 'timeout') {
        
    } else {
        self.vDev.set("metrics:level", 'on');

    }
    
    self.vDev.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/SecurityZone/icon_"+state+".png");
    
    /*
    self.controller.emit("SecurityZone.setPos", {
        azimuth: azimuth,
        altitude: altitude
    });
    */
};

SecurityZone.prototype.testRule = function () {
    var self = this;
    
    if (self.mode !== "on")
        return;
    
    // TODO check if delay already running
    // TODO check if alarm already running
    
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
    
    if (trigger) {
        if (self.config.delay) {
            self.setState('timeout');
            self
        }
        // TODO trigger delay
        // TODO trigger timeout
        // TOOO emit event
        // TODO set mode
        
        // Send Notification
        //self.controller.addNotification("warning", self.message, "module", "SecurityMode");
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


 
