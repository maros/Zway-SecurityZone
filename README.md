# Zway-SecurityZone

TODO

# Configuration

## delay

TODO

## timeout

TODO

## type

TODO

# Virtual Devices

This module creates a virtual device that controls the state of the
security zone.

# Events

## security.cancel

Called whenever an alarm end or is canceled.

## security.delayed_alarm

Called whenever a delayed alarm is triggered. When the security zone virtual
device is turned off before the delay finishes, a security.cancel event
will be emited, otherwise a security.alarm event will follow.

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
