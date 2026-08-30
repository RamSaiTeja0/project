# Reference timetables

Drop one JSON file per **reference** timetable in this directory. Every `.json`
file here is registered at startup as a reference timetable, in filename order.
The filename (minus `.json`) becomes the timetable id.

The **primary** timetable is `../timetable-source.json`, not this directory.

Each file uses the same shape as the primary source:

```json
{
  "meta": {
    "primaryClass": "DCME-IV", "branch": "DCME", "semester": "C23 — IV SEM",
    "days": ["Monday", "…"], "periods": [1, 2, 3, 4, 5, 6, 7]
  },
  "faculty": [{ "id": "FAC003", "name": "Ms.Harathi" }],
  "subjectFaculty": { "ANDROID PROG": "Ms.Harathi" },
  "classes": [{ "class": "DCME-IV", "rows": { "Monday": [
    { "period": 1, "subject": "ANDROID PROG" }
  ] } }]
}
```

A faculty is identified by their **canonical name**, so `Ms.Harathi` in this
directory is the same person as `Ms.Harathi` in the primary timetable. Spell the
name identically or she will be treated as two people and wrongly reported free.

A file that fails validation is skipped with a logged error; the rest of the
application keeps running.
