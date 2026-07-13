---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
---
# <% tp.file.title %>

```calendar-nav
```

# Today's Focus
*오늘 의도적으로 완수하고자 하는 가장 중요한 일을 최대 3개까지 작성합니다.*
- 
- 
- 

# Tasks

````tabs
tab: Due Today
```tasks
not done
due <% tp.file.title %>
sort by priority
hide due date
limit 10
```
tab: Overdue
```tasks 
not done 
due before <% tp.file.title %>
sort by priority
hide due date
limit 10
```
tab: Completed
```tasks
done <% tp.file.title %>
hide done date
hide due date
limit 10
```
````

# Reflection

## 성찰 (Reflection)
*오늘 성찰해 볼 만한 가장 의미 있는 단 하나의 사건은 무엇이며, 이를 통해 나 자신에 대해 무엇을 배웠나요?*
*(오늘 있었던 일들을 나열하는 것이 아니라, 나를 더 깊이 이해하는 것에 집중합니다. 양보다 질이 중요합니다.)*
- 

## 변화 (Change)
*오늘의 경험으로 인해 앞으로 내 생각이나 행동에서 무엇이 달라질까요?*
*(단순 행동 계획이 아닌, 판단력 개선, 관점 전환, 사고의 변화 등 내적인 성장을 기술합니다.)*
- 

## 다음 실험 (Next Experiment)
*내일 의도적으로 시도해 볼 구체적이고 즉각적인 작은 행동 실험은 무엇인가요?*
*(관찰과 측정이 가능하고 마찰력이 적은 아주 작은 단 하나의 행동이어야 합니다. 예: 전날 밤에 운동복 준비하기, 입찰 전 탈출 가격 계산하기 등)*
- 

## 연관 참조 (References)
*오늘의 성찰과 직접적으로 연관된 다른 노트나 태스크(Todoist)에 대한 링크만 간단히 남깁니다. (중복 작성 금지)*
- 

# Overview

````tabs
tab: Meetings
```dataviewjs
let meetings = dv.pages('"PARA/RESOURCES/MEETINGS"')
    .where(m => m.meeting_status === false && m.type === "meeting");

// Separate meetings with and without scheduled dates
let withDates = meetings.where(m => m.scheduled_date);
let withoutDates = meetings.where(m => !m.scheduled_date);

// Sort meetings with dates by scheduled date
withDates = withDates.sort(m => m.scheduled_date);

// Combine both lists, with meetings having dates first
let allMeetings = withDates.concat(withoutDates);

// Render the table with clickable meeting links
dv.table(
    ["Days", "Meeting", "Scheduled Date", "Start Time", "End Time"],
    allMeetings.map(m => [
        m.scheduled_date ? Math.floor(dv.date(m.scheduled_date).diff(dv.date("today"), 'days').days) : "-", // Calculate days until the meeting
        m.file.link, // Use m.file.link to render the meeting name as a clickable link
        m.scheduled_date ? dv.date(m.scheduled_date).toFormat("MM-dd") : "-",
        m.start_time || "-",
        m.end_time || "-"
    ])
);
```
tab: Projects
```dataviewjs
let pages = dv.pages('"PARA/PROJECTS"')
    .where(p => (p.type == "project_note" || p.type == "project_family") && p.Status != "4 Completed");

// Separate pages with and without due dates
let withDueDates = pages.where(p => p.Due_Date != null);
let withoutDueDates = pages.where(p => !p.Due_Date);

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
        p.Due_Date ? Math.floor(dv.date(p.Due_Date).diff(dv.date("today"), 'days').days) : "-",
        p.file.link,
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