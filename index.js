/*** SecurityZone Z-Way HA module *******************************************

Version: 1.0.0
(c) Maroš Kollár, 2015
-----------------------------------------------------------------------------
Author: maros@k-1.com <maros@k-1.com>
Description:
    This module checks weather updates via weatherundergound.com

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
    // TODO
];

SecurityZone.prototype.init = function (config) {
    SecurityZone.super_.prototype.init.call(this, config);
    
    var self = this;
    
    var langFile        = self.controller.loadModuleLang("SecurityZone");
    
    this.delay          = null;
    this.timer          = null;
    
    this.vDev = this.controller.devices.create({
        deviceId: "SecurityZone_"+this.id,
        defaults: {
            deviceType: "switchBinary",
            metrics: {
                
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
    
    // TODO: remove test callbacks
    // TODO disable alarm delay
    // TODO disable timer
    
    SecurityZone.super_.prototype.stop.call(this);
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

SecurityZone.prototype.attach = function (test) {
    var self        = this;
    
    // TODO Build test
    // TODO Store test
    // TODO Attach test
    
    //this.controller.devices.on(test.device, "change:metrics:level", this._testRule);
    //this.controller.devices.on(test.device, "change:metrics:change", this._testRule);
    
};

SecurityZone.prototype.setState = function (state) {
    var self        = this;
    
    if (state === 'off') {
        // TODO disable alarm delay
        // TODO disable timer
        // TODO reset mode
        // TODO emit event
    }
    
    self.vDev.set("metrics:level", state);
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
    
    if (self.vDev.get("metrics:level") == "off")
        return;
    
    // TODO check if delay already running
    // TODO check if alarm already running
    
    var response = false;
    _.each(self.config.tests,function(test) {
        if (test.testType === "multilevel") {
            response = response || self.op(self.controller.devices.get(test.testMultilevel.device).get("metrics:level"), test.testMultilevel.testOperator, test.testMultilevel.testValue);
        } else if (test.testType === "binary") {
            response = response || (self.controller.devices.get(test.testBinary.device).get("metrics:level") === test.testBinary.testValue);
        } else if (test.testType === "remote") {
            var dev = self.controller.devices.get(test.testRemote.device);
            response = response || ((_.contains(["on", "off"], test.testRemote.testValue) && dev.get("metrics:level") === test.testRemote.testValue) || (_.contains(["upstart", "upstop", "downstart", "downstop"], test.testRemote.testValue) && dev.get("metrics:change") === test.testRemote.testValue));
        }
    });
    
    if (response) {
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


 