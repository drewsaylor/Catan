# Feedback & Iteration — Phase 3: Post-Playtest Report Generator (P2)

## Goal
Create a tool to summarize collected feedback and analytics into a markdown report, identifying patterns for future roadmap planning.

## Non-goals
- No real-time dashboards.
- No cloud-based analysis.
- No machine learning or sentiment analysis.

## Player-facing outcomes
- No visible changes (report is for developers/hosts).

## Technical plan
### Server
- Create report generation endpoint or CLI command:
  - `GET /api/reports/playtest` or `npm run generate-report`
  - Reads all feedback and analytics from DATA_DIR.
  - Generates markdown summary.
- Report includes:
  - **Summary stats:** total sessions, avg duration, completion rate.
  - **Rating distribution:** histogram of 1-5 ratings.
  - **Common feedback themes:** group similar comments (basic keyword matching).
  - **Error patterns:** most common error types.
  - **Recommendations:** based on patterns (e.g., "Many players mentioned trades were confusing").

### Engine
- No changes required.

### TV
- No changes required.

### Phone
- No changes required.

### Shared
- Create report generation utilities:
  - `aggregateFeedback(feedbackFiles)` — combine feedback data
  - `aggregateAnalytics(analyticsFiles)` — combine analytics data
  - `generateMarkdownReport(aggregated)` — format as markdown
- Report output location: `DATA_DIR/reports/playtest-{date}.md`

## APIs & data shape changes
- New endpoint: `GET /api/reports/playtest`
- New CLI command: `npm run generate-report`
- New output directory: `DATA_DIR/reports/`

## Acceptance criteria
- Report generator processes all feedback and analytics files.
- Markdown report includes summary stats.
- Rating distribution shown clearly.
- Common themes identified (basic keyword grouping).
- Report saved to DATA_DIR/reports/.
- Report is human-readable and actionable.

## Manual test scenarios
1) Run report generator with sample data → verify markdown output.
2) Add varied feedback → verify themes are grouped.
3) Include error analytics → verify error patterns summarized.
4) Generate report with no data → verify graceful handling.

## Risk & rollback
- Risk: Theme detection may miss nuance.
- Risk: Large data sets may be slow to process.
- Rollback: Keep report generator as optional tool; manual analysis as fallback.

## Example Report Output
```markdown
# Playtest Report — 2024-01-15

## Summary
- **Sessions:** 12
- **Avg Duration:** 38 minutes
- **Completion Rate:** 83%
- **Avg Rating:** 4.2 / 5

## Rating Distribution
- 5 stars: ████████ 6
- 4 stars: ████ 3
- 3 stars: ██ 2
- 2 stars: █ 1
- 1 star: 0

## Common Themes
- "trading" mentioned 5 times
- "confusing" mentioned 3 times
- "fun" mentioned 8 times

## Error Patterns
- connection_timeout: 2 occurrences
- invalid_trade: 1 occurrence

## Recommendations
- Consider improving trade UI clarity (multiple mentions).
- Investigate connection timeout issues.
```
