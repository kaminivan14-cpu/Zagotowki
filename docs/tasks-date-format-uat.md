# Робота — European date/time presentation

Frontend-only change on feature/orders. No migration, backend, timezone, permissions or stored value changes.

- Shared date labels always use DD.MM.YYYY; timestamps include the four-digit year and 24-hour HH:mm (explicit h23 cycle).
- Schedule, planning, reports, task cards, deadlines, task history and settings dates use these formatters. Human-readable report CSV dates use the same format.
- DateTimeInput now renders a text editor with explicit DD.MM.YYYY / HH:mm / DD.MM.YYYY HH:mm format. Only the parsed ISO value has a form name. Required, min/max, real-calendar and 24-hour validation are enforced before submit; empty optional values remain empty. Form reset restores the initial value.
- This supersedes the native-input-plus-helper approach: there are no browser-localized date/time controls and no AM/PM selector. Existing localToInstant retains Warsaw conversion and DST ambiguity rejection.

Validation: 16 targeted Node tests, targeted Tasks/Planning/Workspace headless tests; locale en-US and browser timezone America/Los_Angeles against company Europe/Warsaw. Widths 375/768/1024/1440. Assertions cover exact dates/times, no AM/PM/ISO date in report presentation, hidden ISO form values, event save/read 13:00 -> 11:00Z -> 13:00 Warsaw and deadline conversion. Lint/build:uat checked. No database regression is needed for presentation-only changes.

Manual UAT after push: inspect Schedule day labels, event start/end preview, Planning dates, Create Task date/deadline, task history and reports. Save a disposable UAT event using known hours and verify its displayed hours after reload. The visible editors themselves must show European format under an en-US browser.
