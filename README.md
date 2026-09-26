# Field Notes

A static engineering journal by Alisina Karimi at **https://alisina.is-a.dev/**, built with GitHub Pages and Jekyll. Warm paper, book typography, blue accents, and open editorial rows keep the writing at the center.

## Local development

Use a current Ruby installation, then run:

```sh
bundle install
bundle exec jekyll serve
```

The Gemfile pins the renderer, Markdown parser, syntax highlighter, feed, and sitemap plugins to the versions used by GitHub Pages. Production builds from the main branch; the custom domain and HTTPS are configured on GitHub Pages.

The homepage is ordered newest first. Article pages include a contents list generated from second-level headings, section links, copyable code blocks, diagrams that scroll at their authored size, and GitHub discussions. Reading and contents links work without JavaScript. Third-party comments load only when the reader chooses to load them or returns from signing in to giscus.

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
discussion_number: 3
description: A one-sentence summary for the index and link previews.
---
```

Write the article in Markdown below the front matter. Use a unique sequence number, keep claims tied to inspectable work, and put project limitations in the article when they matter. Use second-level headings for the contents list and fenced code blocks with a language. Set last_modified_at when the article content changes. The journal index, article navigation, Atom feed, and sitemap are generated from the post files.

## Comments

Comments are backed by [GitHub Discussions](https://github.com/AlisinaDevelo/field-notes/discussions), embedded through [giscus](https://giscus.app/). Readers can also use the permanent GitHub link on each article. No comments or credentials are stored in this repository's static site.

For a new article:

1. Create its discussion in the Announcements category, with the article title and a link to the canonical article URL.
2. Add the real discussion number to the article's front matter. The number above is an example; it must identify the new article's actual thread. Omit this field to omit the discussion section.
3. Keep that number if the article title or URL changes, so existing comments remain attached.

The giscus GitHub App needs discussion access to this repository. Its repository ID is in _config.yml; giscus.json restricts embedding to the two production origins. Set comments.embedded to true after that installation is complete. The Load comments button inserts the widget on demand, and a failed load retains a usable GitHub discussion link. With comments.embedded set to false, the article uses the direct GitHub discussion link. The widget theme is in assets/comments.css.

The production origin allowlist deliberately excludes localhost, so comment embedding is reviewed on the public domain. Local previews still provide real GitHub discussion links. Bump asset_version in _config.yml when changing the stylesheet or article script, to refresh previously cached pages' assets.
