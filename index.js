var cheerio = require('cheerio'),
  request = require('request'),
  async = require('async'),
  fs=require('fs');

// Pull curated list of positions we care about
var jobs = require('./jobs.json');

// Make array to put all the people who did these jobs in the past
var roles = jobs.map(function(d){ return { name: d, people: [] } });
var csv = 'year,date,role,name,vote,voteType'

// Let's find the number of total results by requesting just 25 records and scraping the total
request.get("https://www.congress.gov/search?searchResultViewType=compact&q={%22source%22:%22nominations%22,%22congress%22:%22all%22,%22nomination-type%22:%22Civilian%22,%22nomination-status%22:%22Confirmed+by+Senate%22}&pageSize=25", function(err, res, body){
  if(err) throw err;
  $ = cheerio.load(body);
  
  // Grab total number of records and build out an array of them
  resultsNumber = $('.results-number').first().text();
  resultsNumber = parseInt(resultsNumber.split("of ")[1].trim().replace(',', ''));
  totalPages = Math.ceil(resultsNumber / 250);
  var pages = [];
  for(i=1; i<=totalPages; i++){
    pages.push(i);
  }

  url_base = 'https://www.congress.gov/search?searchResultViewType=compact&q={%22source%22:%22nominations%22,%22congress%22:%22all%22,%22nomination-type%22:%22Civilian%22,%22nomination-status%22:%22Confirmed+by+Senate%22}&pageSize=250&page=';

  // Go through each page of the results
  async.eachSeries(pages, function(page, nextPage){
    console.log(page);
    
    request.get( url_base + page, function(err, res, body){   
      $ = cheerio.load(body);
      
      // Pull the text of the nomination
      async.eachOfSeries($(".basic-search-results-lists li.compact"),function(item, i, nextNomination){
        // Grab the name
        var name = $(item).find('.result-heading strong').text()
          .split(" — ")[0];
        
        var role = $(item).find('.result-item').first().text()
          .match(/to be.*?(,|\.)/);
        
        if(!role)
          nextNomination();
        
        else {
          role = role[0].replace("to be ", "")
            .replace(",", "")
            .replace(".", "");
        
          // Get the year
          var year = parseInt(
            $(item).find('.result-item').last().find('span').text().substr(6,4)
          );
  
          var date = $(item).find('.result-item').last().find('span').text()
            .substr(0,10);
  
          // Check to see if vote is spelled out in the nomination
          var vote = $(item).find('.result-item').last().find('span');
          
        
          // Let's now check to see if the basic page has the most recent vote
          async.waterfall([
            function(processVote){

              if(vote.text().indexOf('Confirmed by the Senate') != -1){
                processVote(null, vote.text());
              }    
              else {
                // Oh dear, looks like we'll have to go one page deeper. boo.
                url = vote.find('a').attr('href');
                request.get(url, function(err, res, body){
                  if(err) throw err;

                  $ = cheerio.load(body);
                  var text= "";
                  $('td.actions').each(function(i,item){
                    if( $(item).text().indexOf('Confirmed by the Senate') != -1 ){
                      text = $(item).text();
                      return false
                    }
                  })
                  processVote(null, text);
                });
              }
            },
            function(text, doneWithVote){
              // Pull vote information -- unanimous consent? or actual roll-call total?
              if( text.indexOf('Voice') != -1 ){
                vote = 100;
                voteFlag = "voice";
              }
  
              else if( text.indexOf('Unanimous Consent') != -1){
                vote = 100;
                voteFlag = "unanimous";
              }
              else {
                try {
                  vote = parseInt(text.substr(15, 1000)
                    .split("Vote. ")[1]
                    .split("-")[0]);
                  voteFlag = "roll call"
                  }
                catch(e){
                  console.log(text);
                  fs.appendFileSync('err.log', `${name},${year},"can't split text","${text.trim()}"\n`);
                  console.log("can't split apart the vote for some reason")
                }
              }  
              
              doneWithVote(null, { vote, voteFlag })  
            }
          ],
          function(err, voteData){
            if(!err && voteData.vote) {
              // Add to object
              thisRole = roles.find(function(d){ return d.name == role });
              if( thisRole ){
                thisRole.people.push({
                  name,
                  year,
                  date,
                  vote: voteData.vote,
                  voteFlag: voteData.voteFlag
                });
              }  
    
              // Regardless of if it's included in the list, add it to the CSV
              csv += `\n${year},${date},"${role}","${name}",${voteData.vote},"${voteData.voteFlag}"`
            }     
            // Go to next loop
            nextNomination();            
          })       
        }
      }, function(){
        nextPage();
      })
    })
  }, function(){
    data = JSON.stringify(roles, null, " ");
    fs.writeFileSync("output.json", data);
    fs.writeFileSync('output.csv', csv);
  });
});

