# Робота — European date/time presentation

Frontend-only change on feature/orders. No migration, backend, timezone, permissions or stored value changes.

- Shared date labels always use DD.MM.YYYY; timestamps include the four-digit year and 24-hour HH:mm (explicit h23 cycle).
- Schedule, planning, reports, task cards, deadlines, task history and settings dates use these formatters. Human-readable report CSV dates use the same format.
- All Tasks date/time/datetime-local fields use DateTimeInput: native ISO values, native validation and pickers are retained, with an adjacent canonical European preview and accessible description. Preview follows edits and form resets.
- Native picker internals remain controlled by browser/OS locale and may display their own date order or AM/PM. The application-owned preview, summaries and saved/read labels are locale-independent. This follows the permitted native-input-plus-helper approach; no hand-written date parser or change to localToInstant was introduced.

Validation: 16 targeted Node tests, targeted Tasks/Planning/Workspace headless tests; locale en-US and browser timezone America/Los_Angeles against company Europe/Warsaw. Widths 375/768/1024/1440. Assertions cover exact dates/times, no AM/PM/ISO date in report presentation, native ISO form values, event save/read 13:00 -> 11:00Z -> 13:00 Warsaw and deadline conversion. Lint/build:uat checked. No database regression is needed for presentation-only changes.

Manual UAT after push: inspect Schedule day labels, event start/end preview, Planning dates, Create Task date/deadline, task history and reports. Save a disposable UAT event using known hours and verify its displayed hours after reload. Do not interpret browser-native AM/PM controls as the canonical saved-time summary.
