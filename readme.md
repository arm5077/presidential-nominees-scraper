# Congress.gov presidential nominees scraper
This script uses [Cheerio](https://github.com/cheeriojs/cheerio) to scrape Senate voting data on presidential nominees submitted since 1981.
It outputs two files:
* output.csv, a comma-deliminated file listing every position submitted, along with the nominee's name, the date, the year, the type of vote, and the total "yea's" (if applicable).
* output.json, a nested array which includes data for cabinet-level positions only.
