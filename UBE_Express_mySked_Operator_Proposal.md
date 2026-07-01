# PROJECT PROPOSAL

## mySked Passenger Information Dashboard

### A Smart Passenger Information System for UBE Express

Prepared for: **UBE EXPRESS, INC.**  
Prepared by: **Broadimagi IT Solutions**  
Platform: **mySked v3.3**  
Web app: **mysked.broadimagi.com**  
Current configuration reviewed: **July 1, 2026**

---

## Executive Summary

UBE EXPRESS, INC. operates airport bus services where passengers need clear, timely, and reliable departure information. For airport-bound travelers, uncertainty around routes, boarding gates, trip availability, and departure times can directly affect the travel experience.

Broadimagi IT Solutions proposes the continued deployment and operational use of **mySked**, a cloud-based Passenger Information Dashboard designed for transport operators. The platform converts operator-maintained route and schedule data into a live passenger-facing display that can be viewed on terminal screens, counters, Smart TVs, tablets, and mobile devices.

For UBE Express, the current mySked dashboard is already configured with the operator brand, active and inactive routes, live route rotation, current departure tables, gate information, trip status, and passenger advisories. The system provides an airport-style dashboard for public viewing and a route selection view for staff or passengers who need to check a specific service.

## Current UBE Express Web App Configuration

The current mySked deployment is configured for:

- Operator name: **UBE EXPRESS, INC.**
- Tagline: **Ultimate Bus Experience**
- Primary brand color: **#6A2C91**
- Default display theme: **Dark mode**
- Schedule refresh interval: **60 seconds**
- Route display cycle interval: **15 seconds**
- Public footer link: **https://web.facebook.com/UbeExpress**
- Displayed columns: **Departure**, **Gate**, **Status**
- Status colors:
  - Green: **On Time**, **Available**
  - Orange: **Delayed**, **Full**
  - Red: **Cancelled**, **Unavailable**

The active public advisory messages are:

- **Please arrive at the terminal at least 30 minutes before your scheduled departure.**
- **Departure times may change depending on traffic conditions.**

## Current Route Coverage

The web app currently lists **12 UBE Express routes**, with **4 active routes** and **8 inactive or reference routes**.

### Active Routes

1. **PITX to NAIA Terminals 1, 2 & 3**
   - Origin: PITX
   - Destination: NAIA Terminals 1, 2 & 3
   - Fare: PHP 150
   - Schedule type: Table

2. **NAIA Terminal 3 to PITX**
   - Origin: NAIA Terminal 3
   - Destination: PITX
   - Fare: PHP 150
   - Gate: Bay 14
   - Schedule type: Table

3. **Robinsons Sta. Rosa to NAIA Terminals 1, 2 & 3**
   - Origin: Robinsons Sta. Rosa
   - Destination: NAIA Terminals 1, 2 & 3
   - Fare: PHP 300
   - Schedule type: Table

4. **NAIA Terminal 3 to Robinsons Sta. Rosa**
   - Origin: NAIA Terminal 3
   - Destination: Robinsons Sta. Rosa
   - Fare: PHP 300
   - Gate: Bay 14
   - Schedule type: Table

### Inactive or Reference Routes

The dashboard also keeps inactive routes available for operational reference, future activation, or passenger information when service resumes:

- NAIA Terminal 3 to Victory Liner Pasay
- Victory Liner Pasay to NAIA Terminal 3
- District Imus to NAIA Terminal 3
- NAIA Terminal 3 to District Imus
- Robinsons Manila to NAIA Terminals 1, 2 & 3
- NAIA Terminal 3 to Robinsons Manila
- Araneta City Cubao to NAIA Terminals 1, 2 & 3
- NAIA Terminal 3 to Araneta City Cubao

For the Victory Liner Pasay routes, the system supports text-based interval schedules such as **04:00 PM to 08:00 PM, every 30 minutes**.

## Proposed Passenger Information Experience

mySked gives UBE Express passengers a clear answer to the questions they ask most often:

- Which route is operating now?
- What is the next departure?
- Which gate or bay should I proceed to?
- Is the trip available, unavailable, delayed, full, or cancelled?
- Are there important reminders before departure?
- Has the schedule changed recently?

The passenger-facing dashboard is designed to work in public transport environments where information must be readable quickly, even from a distance.

## Key Features

### 1. Live Airport-Style Departure Dashboard

The dashboard displays active routes in a large-format transport display layout. For each route, it presents the configured schedule columns:

- Departure time
- Gate or bay
- Trip status

For UBE Express, the current dashboard shows **Departure**, **Gate**, and **Status**, matching the live operator configuration.

### 2. Automatic Route Rotation

The main display automatically cycles through active routes every **15 seconds**, allowing a single screen to show multiple UBE Express services without staff intervention.

This is ideal for:

- Airport counters
- Passenger waiting areas
- Bus bay screens
- Terminal lounges
- Smart TV displays
- Dispatch monitoring screens

### 3. Route Selection View

Users can switch from the main dashboard to a route view that separates:

- Active routes
- Non-active routes

When a route is selected, the app shows the full schedule table, next departure, and current trip status. This is useful for staff assistance, passenger inquiries, and detailed route checking.

### 4. Next Departure Highlight

For active table-based routes, mySked determines the next chronological departure based on the current time and highlights it in the route workspace.

If a route is inactive, the system clearly marks it as not active while still allowing the schedule to be shown for reference when available.

### 5. Service Status Display

The system maps operator-defined statuses into clear visual states:

- **Available / On Time** as positive service status
- **Delayed / Full** as caution status
- **Cancelled / Unavailable** as unavailable service status

This lets UBE Express communicate operational changes in a format passengers can understand quickly.

### 6. Passenger Advisories

Active advisories appear in a moving announcement bar across the dashboard. The current UBE Express advisories remind passengers to arrive at least 30 minutes before departure and note that departure times may change depending on traffic conditions.

This feature can also be used for:

- Weather advisories
- Traffic advisories
- Holiday schedules
- Temporary bay changes
- Route diversions
- Suspended trips
- Airport operational notices

### 7. Operator Branding

The UBE Express deployment includes:

- Operator name
- Tagline
- Logo support
- Primary brand color
- Dark or light display theme
- Footer text or public link

This helps ensure the dashboard looks like an official UBE Express information screen rather than a generic timetable.

### 8. Cloud-Based Data Management

mySked uses a cloud-based data feed backed by operator schedule sheets. Updates to routes, schedules, advisories, display columns, labels, colors, and refresh timing can be reflected on public displays without installing new software on each screen.

The current deployment supports:

- Multi-operator listing
- Operator-specific routes
- Operator-specific schedules
- Operator-specific advisories
- Global platform settings
- Maintenance mode messaging
- Configurable display labels
- Configurable status colors

### 9. Maintenance Mode and Support Messaging

The platform includes a global maintenance mode. If enabled, the dashboard can show a maintenance message and support contact instead of stale or confusing schedule data.

The current platform support email is configured as **support@broadimagi.com**, with a maintenance retry interval of **120 seconds**.

## Benefits to UBE Express

### Improved Passenger Confidence

Passengers can quickly see the next available trip, route status, and boarding location. This reduces uncertainty, especially for airport passengers managing flight schedules.

### Fewer Repetitive Counter Inquiries

Clear public screens reduce repeated questions about departure times, availability, gates, and route operations.

### Faster Operational Updates

Schedules, inactive routes, advisories, and status changes can be updated centrally and reflected across connected displays.

### Better Handling of Service Changes

The system supports available, unavailable, delayed, full, cancelled, inactive, and text-based interval operations, giving UBE Express flexibility during traffic disruption, low-demand periods, terminal changes, or temporary route suspensions.

### Consistent Brand Presence

Branded displays reinforce UBE Express as a modern airport transport provider and create a more professional passenger information experience.

### Scalable for Additional Operators and Routes

The platform currently supports multiple operators in the same portal. As more transport services are added, each operator can have separate branding, routes, schedule data, status settings, and advisories.

## Recommended Deployment Areas

For UBE Express, mySked can be deployed in:

- NAIA Terminal 3 counters and bay areas
- PITX passenger areas
- Robinsons Sta. Rosa pickup and waiting areas
- Dispatch offices
- Customer assistance counters
- Smart TV screens near ticketing or boarding points
- QR-linked mobile passenger access

## Implementation Scope

### Included in the mySked Deployment

- Passenger dashboard at **mysked.broadimagi.com**
- UBE Express branded dashboard view
- Active and inactive route display
- Schedule tables with Departure, Gate, and Status columns
- Automatic refresh every 60 seconds
- Automatic active route cycling every 15 seconds
- Advisory ticker
- Route selection workspace
- Light and dark theme support
- Cloud-based schedule feed
- Maintenance mode and support messaging

### Suggested Next Enhancements

To further improve the operator experience, Broadimagi may add:

- Admin login for authorized schedule editing
- QR code generator per route or terminal display
- Dedicated public mobile passenger view
- Display templates per location
- Audit log for schedule and advisory changes
- Exportable daily dispatch board
- Optional estimated arrival or travel time field
- Role-based access for head office, dispatch, and terminal staff

## Conclusion

mySked provides UBE Express with a practical, already-configured Passenger Information Dashboard that improves schedule visibility, passenger communication, and operational consistency.

By using the current UBE Express routes, live status fields, public advisories, and branded display settings, mySked gives passengers a clearer airport transport experience while giving operators a flexible platform for route updates and service communication.

Broadimagi IT Solutions recommends positioning mySked as UBE Express's official passenger information dashboard for terminal displays, customer assistance counters, and mobile schedule access.
