# Zway-SecurityZone

This module creates a zone that can checks multiple binary and multilevel
sensors as well as switches. When a check on one these devices fails, an alarm
is triggered, either immediately or delayed, allowing for a safe disarming of
the zone within the given delay period.

The state security zone can be armed and disarmed via a virtual switch device.
Optionally arming of a zone can also be delayed, ie. allowing for leaving
the house without tripping alarms. When arming an alarm zone, all sensors
are checked if they are already tripped (eg. if a window is left open)

In case of an alarm this module will not perform any actions. It will just
emit an event, which should be catched and processed by other modules in the
automation engine (eg. sending notifications, turning on alarm sirens, ...)
The EventWatcher module from https://github.com/maros/Zway-EventWatcher
can be used to act upon alarms.

# Configuration

## delayAlarm

Specifies an optional delay between detection of the alarm and issuing of the 
alarm event. Turning off the security zone within the delay period prevents 
the alarm event from being emitted. Delay is specified in seconds.

## cancelable

This option controls if delayed alarms continue after the alarm condition
has gone away, or if they should continue (default).

## delayActivate

Specifies an optional delay between arming an alarm zone and activating
the security sensors. Delay is specified in seconds.

## timeout

Specifies a timeout for the alarm state after the last sensor was untripped.
Timeout is specified in seconds.

## singleZone

If this option is enabled, only one security zone of same type may be in the
state alarm, timeout or delayed alarm. 

Enable this option if you have multiple security zones with different
delay alarm settings.

## type

Specifies the type of alarm (intrusion, flood, ... or other)

## otherType

Custom alarm types can be used when type is set to 'other'

## tests

Select the devices and conditions that shall trip the alarm.

## tests.testType

Select the type of device you want to test. Binary, MultiLevel or remotes
(will require the "Trap events from remotes" module)

## tests.testBinary, tests.testMultilevel, tests.testRemote

Tests for each device type

## tests.testBinary.check, tests.testMultilevel.check

When a security zone is activated checks will be performed if the alarm 
condition is already met. This option specifies the time when these checks
should be performed: Either immediately, delayed or never.

## tests.testBinary.device, tests.testMultilevel.device, tests.testRemote.device

Pick the devices that shall trip the alarm. These are usually door/window 
sensors, window handles, glass breaking sensors for intrusion alarms, 
smoke sensors for smoke alarms, ... but can also be switches or temperature
sensors for low/high temperature alarms.

## tests.testMultilevel.testOperator

Test operator for MultiLevel sensors/switches.

## tests.testBinary.testValue, tests.testMultilevel.testValue, tests.testRemote.testValue

Value for the device test. If the criteria matches the alarm will be tripped.

## testThreshold

If this option is set, alarm will only be triggered if a certain number of 
tests fail. This can be used to prevent triggering alarms from stray sensor 
reports. By default it is sufficient for only one test to fail for an alarm
to be triggered.

# Virtual Devices

This module creates a virtual device that controls the state of the
security zone.

metrics:level indicates if the alarm zone is armed or not. The device stores 
the current alarm state under metrics:state. Possible states are:

* on: Zone in armed
* off: Zone in unarmed
* delayActivate: Exit delay in progress
* delayAlarm: Alarm delay in progress
* alarm: Alarm was tripped
* timeout: Timeout after alarm was untripped

# Events

Emits different events based on the type of the alarm. Valid types are

* intrusion
* flood
* smoke
* gas
* heat
* cold
* tamper
* energy
* other (custom user defined type)

All events have the name of the zone and the ID of the management device
as parameters

## security.$TYPE.stop

Called whenever an alarm ends or is stopped.

## security.$TYPE.delayAlarm

Called whenever a delayed alarm is triggered. When the security zone virtual
device is turned off before the delay finishes, a security.cancel event
will be emitted, otherwise a security.alarm event will follow.

## security.$TYPE.delayCancel

Called when a delayed alarm is cancelled in time.

## security.$TYPE.alarm

Called whenever an alarm is triggered.

## security.$TYPE.warning

Called whenever the zone is activated, and alarm sensors are still triggered
(ie. leaving an opened window when leaving)

# Installation

Install the BaseModule from https://github.com/maros/Zway-BaseModule first

The prefered way of installing this module is via the "Zwave.me App Store"
available in 2.2.0 and higher. For stable module releases no access token is 
required. If you want to test the latest pre-releases use 'k1_beta' as 
app store access token.

For developers and users of older Zway versions installation via git is 
recommended.

```shell
cd /opt/z-way-server/automation/userModules
git clone https://github.com/maros/Zway-SecurityZone.git SecurityZone --branch latest
```

To update or install a specific version
```shell
cd /opt/z-way-server/automation/userModules/SecurityZone
git fetch --tags
# For latest released version
git checkout tags/latest
# For a specific version
git checkout tags/1.02
# For development version
git checkout -b master --track origin/master
```

# License

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or any 
later version.

Flame icon by João Proença from the Noun Project
Thermometer icons by Jardson Almeida from the Noun Project
Water icon by Chris Evans from the Noun Project
Lock icon by Jems Mayor from the Noun Project
Person icon by Yamini Ahluwalia from the Noun Project
Lightning icon by Steve Laing from the Noun Project

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.
