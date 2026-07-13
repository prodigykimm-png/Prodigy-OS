---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
journal: weekly
journal-start-date: {{week_start_date}}
journal-end-date: {{week_end_date}}
journal-section: week
---
# <% tp.file.title %>

```calendar-timeline
mode: week
```

````tabs
tab: Due This Week
```dataviewjs
// Extract year and week number from the note title
const title = dv.current().file.name;
const [year, monthName, weekLabel] = title.split('-');
const weekNumber = parseInt(weekLabel.replace('W', ''), 10);

// Calculate start and end dates for the week
const startDate = moment().year(year).week(weekNumber).startOf('week').format('YYYY-MM-DD');
const endDate = moment().year(year).week(weekNumber).endOf('week').format('YYYY-MM-DD');

dv.taskList(dv.pages().file.tasks
    .where(t => !t.completed && t.due && t.due >= dv.date(startDate) && t.due <= dv.date(endDate))
    .sort(t => t.priority)
    .limit(10)
);
```
tab: Completed This Week
```dataviewjs
// Extract year and week number from the note title
const title = dv.current().file.name;
const [year, monthName, weekLabel] = title.split('-');
const weekNumber = parseInt(weekLabel.replace('W', ''), 10);

// Calculate start and end dates for the week
const startDate = moment().year(year).week(weekNumber).startOf('week').format('YYYY-MM-DD');
const endDate = moment().year(year).week(weekNumber).endOf('week').format('YYYY-MM-DD');

dv.taskList(dv.pages().file.tasks
    .where(t => t.completed && t.completion && t.completion >= dv.date(startDate) && t.completion <= dv.date(endDate))
    .limit(10)
);
```
````

# Weekly Goals


# Summary of the Week


# Notes & Reflections


# AI 추천 원칙 검토 (AI Suggested Principles)

*AI가 한 주간 축적된 일일 성찰(증거)에서 감지한 패턴을 바탕으로 제안한 원칙 후보를 1차 검토합니다.*

- **제안된 원칙 (Proposed Principle)**: 
- **근거 자료 (Supporting Evidence)**: 
- **관련 성찰 (Related Reflections)**: 
- **사용자 결정 (User Decision)**: [ ] 승인 (Approve) / [ ] 반려 (Reject) / [ ] 증거 계속 수집 (Continue Collecting Evidence)


# Plan for Next Week

# Overview

````tabs
tab: Meetings
```dataviewjs
let startDate = dv.current().file.frontmatter["journal-start-date"];
let endDate = dv.current().file.frontmatter["journal-end-date"];

let meetings = dv.pages('"PARA/RESOURCES/MEETINGS"')
    .where(m => m.meeting_status === false && m.type === "meeting" && m.scheduled_date >= dv.date(startDate) && m.scheduled_date <= dv.date(endDate));

let withDates = meetings.where(m => m.scheduled_date);
let withoutDates = meetings.where(m => !m.scheduled_date);

withDates = withDates.sort(m => m.scheduled_date);

let allMeetings = withDates.concat(withoutDates);

dv.table(
    ["Days", "Meeting", "Scheduled Date", "Start Time", "End Time"],
    allMeetings.map(m => [
        m.scheduled_date ? Math.floor(dv.date(m.scheduled_date).diff(dv.date("today"), 'days').days) : "-",
        m.file.link,
        m.scheduled_date ? dv.date(m.scheduled_date).toFormat("MM-dd") : "-",
        m.start_time || "-",
        m.end_time || "-"
    ])
);
```
tab: Projects
```dataviewjs
let startDate = dv.current().file.frontmatter["journal-start-date"];
let endDate = dv.current().file.frontmatter["journal-end-date"];

let pages = dv.pages('"PARA/PROJECTS"')
    .where(p => (p.type == "project_note" || p.type == "project_family") && 
                p.Status != "4 Completed" && 
                (p.Due_Date >= dv.date(startDate) || p.Due_Date == null) && 
                (p.Due_Date <= dv.date(endDate) || p.Due_Date == null));

// Separate pages with and without due dates
let withDueDates = pages.where(p => p.Due_Date != null);
let withoutDueDates = pages.where(p => p.Due_Date == null);

// Sort pages with due dates by: Due Date -> Priority Level (A-Z) -> Status (Z-A)
withDueDates = withDueDates.sort(p => p.Due_Date)
    .sort(p => p.Priority_Level)
    .sort(p => p.Status, 'desc');

// Sort pages without due dates by: Priority Level (A-Z) -> Status (Z-A)
withoutDueDates = withoutDueDates.sort(p => p.Priority_Level)
    .sort(p => p.Status, 'desc');

// Combine both lists
let allPages = withDueDates.concat(withoutDueDates);

// Render the table with clickable project links
dv.table(
    ["Days", "Project", "Priority Level", "Status", "Due Date"],
    allPages.map(p => [
        p.Due_Date ? Math.floor(dv.date(p.Due_Date).diff(dv.date("today"), 'days').days) : "-", // Display whole number of days
        p.file.link, // Use p.file.link to render the project name as a clickable link
        p.Priority_Level || "-",
        p.Status || "-",
        p.Due_Date ? dv.date(p.Due_Date).toFormat("MM-dd") : "-"
    ])
);
```
tab: Areas
```dataview
table area_category as "Area Category", created as "Date Created" from "PARA/AREAS"
WHERE type = "area_family"
```
````