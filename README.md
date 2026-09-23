# Field Notes

A static engineering journal by Alisina Karimi, built with GitHub Pages and Jekyll. The visual language uses warm paper, ink, a single signal color, monospace annotations, and diagrams drawn for each essay.

## Add a note

Create `_posts/YYYY-MM-DD-your-slug.md` with front matter like this:

```yaml
---
title: A useful title
date: 2026-09-23 15:00:00 +0200
sequence: 3
code: SYS
topic: Distributed systems
series: Systems
project_name: Project name
project_url: https://github.com/AlisinaDevelo/project
project_description: One short, factual sentence about the project.
source_label: Go / TCP
reading_time: 5
description: A one-sentence summary for the index and link previews.
---
```

Write the article in Markdown below the front matter. Use a unique `sequence` number, keep claims tied to inspectable work, and put project limitations in the article when they matter. The journal index, article navigation, Atom feed, and sitemap are generated from the post files.

GitHub Pages builds the site from the `main` branch. The custom hostname is configured after the is-a.dev registration is accepted.
