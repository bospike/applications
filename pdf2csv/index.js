var _ = require('underscore'),
    PDFParser = require('pdf2json');
var fs = require('fs');
var csvWriter = require('csv-write-stream');


var sqlite3 = require('sqlite3').verbose();

function equal(first, second){
  return Math.abs(first - second) <= 0.1;
}
function convertToRel(value){
  return value * 0.825 / 20;
}
function textInInterval(text, min, max){
  return (text.x >= min) && (text.x + convertToRel(text.w) <= max);
}

function parseAddresses(adressLines){
  var names = [];
  var adrs = [];
  var inCareOf = '';
  var city = '';
  var state = '';
  var zip = '';
  var index = 0;
  var lastMatched = '';
  _.each(adressLines, function(line){
    line = line.trim();
    if (index === 0){
      names.push(line);
    }
    else{
      var match = line.match(/^%.+$/);
      if (match){
        inCareOf = line;
      }
      else{
        match = line.match(/^(.+)\s+(\w{2})\s+([\d-]+)$/);
        if (match){
          city = match[1];
          state = match[2];
          zip = match[3];
          if (lastMatched){
            adrs.push(lastMatched);
          }
          lastMatched = line;
        }
        else{
          adrs.push(line);
        }
      }
    }
    index++;
  });
  if (!inCareOf && adrs.length >= 2){
    inCareOf = _.first(adrs);
    adrs = _.tail(adrs)
  }
  return {
    ownerName: names.join(' '),
    address: adrs.join(' '),
    inCareOf: inCareOf,
    city: city,
    state: state,
    zip: zip
  };
}

function printLines(writer, taxRollYear, ownerNumber, ownerNameLines, leases){
  if (ownerNumber){
    parsedAddress = parseAddresses(_.compact(ownerNameLines));
    _.each(leases, function(lease){
      var leaseLines = _.compact(lease.leases);
      var obj = {
        taxRollYear: taxRollYear,
        ownerNumber: ownerNumber,
        DOI: lease.DOI,
        leaseNumber: lease.leaseNumber,
        interestType: lease.interestType,
        operator: _.first(_.compact(lease.operatorLines)),
        leaseName: _.first(leaseLines),
        appraisalType: lease.appraisalType,
        RRC: _.compact(_.map(leaseLines, function(line){
          line = decodeURIComponent(line).replace(/\s+/g, ' ');
          var match = line.match(/(RRC\s*#\s*(\d+))/im);
          if (match){
            return match[2];
          }
          return undefined;
        })).join('\n').trim()
      };
      
      obj = _.extend(obj, parsedAddress);
      _.each(obj, function(value, key){
        obj[key] = decodeURIComponent(value).replace(/\s+/g, ' ');
      });

      writer.write(obj);
    });
  }
}

var oldPercent = 0;
function updatePercent(file, percent, callback){
  if (percent !== oldPercent){
    oldPercent = percent;
    var db = new sqlite3.Database('./files.db');
    db.serialize(function() {
      var stmt = db.prepare("UPDATE file_info SET ready = ? WHERE upload_file_name = ?");
      stmt.bind(percent, file);
      stmt.run(function(){
        callback();
        stmt.finalize();
        db.close();
      });
    });
  }
  else{
    oldPercent = percent;
    callback();
  }
}
var _onPDFBinDataReady = function (pdf) {
  var pdf_file_name = pdf.pdfFilePath;
  var csv_file = pdf.pdfFilePath + '.csv';

  var writer = csvWriter();
  writer.pipe(fs.createWriteStream(csv_file));

  var stopParsing = false;
  for (var i in pdf.data.Pages) {
      var percent = Math.floor(i / pdf.data.Pages.length * 100);
      var page = pdf.data.Pages[i];
      var newPage = true;
      var newLine = true;
      var lastLineY, lineY;
      var ownerNameLines;
      var ownerNameLine = '';
      var leases;
      var leaseLine = '';
      var leaseLines;
      var operatorLine = '';
      var operatorLines;

      var taxRollYear;
      var ownerNumber;
      var ownerName;
      var leaseNumber;
      var DOI;
      var interestType;
      for (var j in page.Texts){
        var text = page.Texts[j];
        var T = text.R[0].T.trim();
        
        lineY = text.y;
        newLine = lineY !== lastLineY;
        
        if (newLine && ownerNameLines && ownerNameLine){
          if (ownerNameLine.match(/^ REAL VALUE$/i)){
            // pushLeases();
            //      function pushLeases(){
                    if (leaseNumber && leaseNumber){
                      leases.push({
                        leaseNumber: leaseNumber,
                        leases: leaseLines,
                        DOI: DOI && DOI.trim(),
                        interestType: interestType && interestType.trim(),
                        operatorLines: operatorLines,
                        appraisalType: appraisalType
                      });
                    }
                    leaseLines = [];
                    DOI = '';
                    interestType = '';
                    operatorLines = [];
                    operatorLine = '';
                    interestType = '';
                    leaseLine = '';
                    leaseNumber = '';
                    appraisalType = ''
              //    }
            printLines(writer, taxRollYear, ownerNumber, ownerNameLines, leases);
            stopParsing = true;
          }

          if (!ownerNameLine.match(/^ NAME AND ADDRESS$/i)){
            ownerNameLines.push(ownerNameLine.trim());
            ownerNameLine = '';
          }
        }
        
        if (newPage && equal(text.x, 33.575) && T.match(/^\d{4}$/)){
          taxRollYear = T;
          newPage = false;
        }
        if (stopParsing || equal(text.y, 4.32) || equal(text.y, 37.2) || (equal(text.y, 3.195))){
          continue;
        }

        if (newLine && leaseLines){
          leaseLines.push(leaseLine.trim());
          leaseLine = '';
        }

        if (newLine && operatorLines){
          operatorLines.push(operatorLine.trim());
          operatorLine = '';
        }

        if (equal(text.x + convertToRel(text.w), 11.3) && T.match(/^\d+$/)){
          // pushLeases();
          //      function pushLeases(){
                  if (leaseNumber && leaseNumber){
                    leases.push({
                      leaseNumber: leaseNumber,
                      leases: leaseLines,
                      DOI: DOI && DOI.trim(),
                      interestType: interestType && interestType.trim(),
                      operatorLines: operatorLines,
                      appraisalType: appraisalType
                    });
                  }
                  leaseLines = [];
                  DOI = '';
                  interestType = '';
                  operatorLines = [];
                  operatorLine = '';
                  interestType = '';
                  leaseLine = '';
                  leaseNumber = '';
                  appraisalType = ''
            //    }
          printLines(writer, taxRollYear, ownerNumber, ownerNameLines, leases);
          ownerNumber = T;
          ownerNameLines = [];
          ownerNameLine = '';
          leases = [];
        }

        if (textInInterval(text, 19.55, 44.3)){
          ownerNameLine = ownerNameLine + ' ' + T;
        }

        if(equal(text.x + convertToRel(text.w), 50.9) && leases){
          // pushLeases();
          //      function pushLeases(){
                  if (leaseNumber && leaseNumber){
                    leases.push({
                      leaseNumber: leaseNumber,
                      leases: leaseLines,
                      DOI: DOI && DOI.trim(),
                      interestType: interestType && interestType.trim(),
                      operatorLines: operatorLines,
                      appraisalType: appraisalType
                    });
                  }
                  leaseLines = [];
                  DOI = '';
                  interestType = '';
                  operatorLines = [];
                  operatorLine = '';
                  interestType = '';
                  leaseLine = '';
                  leaseNumber = '';
                  appraisalType = ''
            //    }
          leaseNumber = T;
        }

        if (equal(text.x, 47.6) && leases){
          appraisalType = T;
        }

        if (textInInterval(text, 51.725, 78.0)){
          leaseLine = leaseLine + ' ' + T;
        }

        if (textInInterval(text, 78.95, 85.55)){
          DOI += ' ' + T;
        }

        if (textInInterval(text, 85.55, 88.0)){
          interestType += ' ' + T;
        }

        if (textInInterval(text, 92.975, 122.0)){
          operatorLine += ' ' + T;
        }

        lastLineY = lineY;
      }
    
    page = undefined;  
    if (!stopParsing && i == pdf.data.Pages.length - 1){
      // pushLeases();
      //      function pushLeases(){
              if (leaseNumber && leaseNumber){
                leases.push({
                  leaseNumber: leaseNumber,
                  leases: leaseLines,
                  DOI: DOI && DOI.trim(),
                  interestType: interestType && interestType.trim(),
                  operatorLines: operatorLines,
                  appraisalType: appraisalType
                });
              }
              leaseLines = [];
              DOI = '';
              interestType = '';
              operatorLines = [];
              operatorLine = '';
              interestType = '';
              leaseLine = '';
              leaseNumber = '';
              appraisalType = ''
        //    }
      printLines(writer, taxRollYear, ownerNumber, ownerNameLines, leases);
    }
  }
  updatePercent(pdf_file_name, 100, function(){

    pdf.destroy();
    pdf = null;
    writer.end()
    writer.destroy();
    writer = null;
    console.log('finished');
  });
};

var _onPDFBinDataError = function (error) {
  console.log(error);
};

var express = require('express');
var multer = require('multer'),
    bodyParser = require('body-parser'),
    path = require('path');

var app = new express();
app.use(bodyParser.json());

var basicAuth = require('basic-auth-connect');
app.use(basicAuth('test', 'pass'));

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.get('/', function(req, res){
  indexPage(res, function(){});
});

app.get('/delete/:id', function(req, res) {
  var id = 'uploads/' + req.params.id;
  var db = new sqlite3.Database('./files.db');

  db.serialize(function() {

    var stmt = db.prepare("DELETE FROM file_info WHERE upload_file_name = ?");
    stmt.bind(id);
    stmt.run(function(){
      stmt.finalize();
      db.close();
      res.redirect('/');
    });
  });

});

app.post('/parse', multer({ dest: './uploads/'}).single('upl'), function(req,res){

  if (req.file){
    insertFile(req.file, function(){
      var pdfParser = new PDFParser();
      pdfParser.on('pdfParser_dataReady', _.bind(_onPDFBinDataReady, this));

      pdfParser.on('pdfParser_dataError', _.bind(_onPDFBinDataError, this));

      pdfParser.loadPDF(req.file.path);
      // pdfParser = null;
      res.redirect('/');
    });
  }
  else{
    res.redirect('/');
  }
});

function insertFile(file, callback){
  oldPercent = -1;
  var db = new sqlite3.Database('./files.db');

  db.serialize(function() {

    var stmt = db.prepare("INSERT INTO file_info (pdf_file_name, upload_file_name) VALUES (?,?)");
    stmt.bind(file.originalname, file.path);
    stmt.run(function(){
      stmt.finalize();
      db.close();
      callback();      
    });
  });

}
function indexPage(res, callback){
  var db = new sqlite3.Database('./files.db');

  db.serialize(function() {

    db.run('CREATE TABLE if not exists file_info (pdf_file_name TEXT, upload_file_name TEXT, ready INTEGER default 0, uploaded DATETIME DEFAULT CURRENT_TIMESTAMP)');

    db.all('select * from file_info', function(err, rows) {
            
            res.render('index', {rows: rows});
            db.close();
            callback();
    });
  });

}

var port = process.env.PORT || 3000;
app.use('/uploads', express.static(__dirname + '/uploads'));
app.listen( port, function(){ console.log('listening on port '+port); } );

// http://stackoverflow.com/questions/12901358/starting-node-js-using-forever-with-nouse-idle-notification-and-other-flags