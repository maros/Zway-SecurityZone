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
            if (command ==='off'
                && self.status.mode === true) {
                self.randomOff();
            }
            this.set("metrics:level", command);
            this.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/RandomDevice/icon_"+command+".png");
        },
        moduleId: this.id
    });
};

SecurityZone.prototype.stop = function () {
    var self = this;
    
    if (this.vDev) {
        this.controller.devices.remove(this.vDev.id);
        this.vDev = null;
    }
    
    SecurityZone.super_.prototype.stop.call(this);
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

SecurityZone.prototype.updateCalculation = function () {
    var self        = this;
    /*
    self.controller.emit("SecurityZone.setPos", {
        azimuth: azimuth,
        altitude: altitude
    });
    */
};


 