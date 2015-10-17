# Zway-SecurityZone

This plugin creates a zone that can consist of multiple binary and multilevel
sensors as well as switches. When a check of these devices fail, an alarm is 
triggered, either immediately or delayed, allowing for a safe disarming of the
zone.

The state security zone can be controlled via a virtual device.

In case of an alarm this plugin will not perform any actions. It will just
emit an event, which should be catched by other modules in ther automation
engine.

# Configuration

## delay

Specifies a delay between detection of the alarm and issuing of the alarm
event. Turning off the security zone within the delay period prevents the 
alarm event from being emitted,

## timeout

Specifies a timeout for the alarm state after the last sensor was untripped.

## type

Specifies the type of alarm (intrusion, flood, ...)

## tests

Select the devices and conditions that shall trip the alarm. 

## tests.testType

Select the type of device you want to test. Binary, MultiLevel or remotes
(Will require the "Trap events from remotes" module)

## tests.testBinary, tests.testMultilevel, tests.testRemote

Tests for each device type

## tests.testBinary.device, tests.testMultilevel.device, tests.testRemote.device

Pick the devices that shall trip the alarm. These are usually door/window 
sensors, window handles, glass breaking sensors for intrusion alarms, 
smoke sensors for smoke alarms, ... but can also be switches or temperature
sensors for low/high temperature alarms

## tests.testMultilevel.testOperator

Test operator for MultiLevel sensors/switches

## tests.testBinary.testValue, tests.testMultilevel.testValue, tests.testRemote.testValue

Value that should trip the alarm.

# Virtual Devices

This module creates a virtual device that controls the state of the
security zone.

The device stores the current alarm state under metrics:state

# Events

## security.cancel

Called whenever an alarm ends or is canceled.

## security.delayed_alarm

Called whenever a delayed alarm is triggered. When the security zone virtual
device is turned off before the delay finishes, a security.cancel event
will be emitted, otherwise a security.alarm event will follow.

## security.alarm

Called whenever an alarm is triggered

# License

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or any 
later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.
