---
cssclasses:
  - hide-properties_editing
  - hide-properties_reading
journal: personal weekly
journal-start-date: 2024-11-11
journal-end-date: 2024-11-17
journal-date: 2024-11-11
---
# Weekly Notes
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
- [x]  Finalize renewable energy provider selection for data centers
- [x]  Conduct bias audit and implement corrections in AI model
- [ ] Complete feasibility report on orbital hotel project
- [ ]  Develop and test additional NGINX security protocols to mitigate brute force attacks and DDoS risks
# Summary of the Week
This week saw significant progress in key areas, particularly in sustainability and AI ethics. We successfully narrowed down potential renewable energy providers, positioning us to make a final selection soon. The bias audit on the autonomous vehicle AI model revealed minor biases, which have been adjusted, enhancing model fairness. The NGINX security review highlighted areas needing improvement, particularly in rate limiting and brute force attack mitigation. The orbital hotel feasibility report is ongoing, with design and financial aspects requiring further refinement.
# Notes & Reflections
- **Sustainability**: The momentum on the Green Data Center Initiative is promising. Partnering with renewable energy providers is not only viable but crucial for our carbon neutrality goals. The team’s dedication to the project was evident in the thorough provider assessments and cost-benefit analysis.
- **AI Ethics**: The bias audit was insightful, reminding us that even minor biases can impact model decisions. Regular auditing remains essential as we scale. Transparency in AI decisions also continues to be a challenge, especially balancing user-friendly communication with technical complexity.
- **Security**: The NGINX review underscored the importance of proactive security measures. We need to invest more time in refining rate limiting and other protective configurations to guard against evolving threats.
# Plan for Next Week
- Complete the orbital hotel feasibility report, focusing on finalizing financial and structural projections.
- Begin implementing selected renewable energy sources for data centers, coordinating with providers on integration timelines.
- Launch the first version of the AI transparency interface, with an emphasis on user testing and collecting feedback.
- Test and deploy enhanced NGINX security protocols, especially for DDoS and brute force attack prevention.
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