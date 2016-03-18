var _ = require('underscore'),
    PDFParser = require('pdf2json');
var fs = require('fs');
var csvWriter = require('csv-write-stream');
var writer = csvWriter();

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
          var match = line.match(/^(RRC\s+(\d+)).*$/);
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

var _onPDFBinDataReady = function (pdf) {
  // var csv_file = pdf.pdfFilePath.replace(/\.PDF/i, '.csv');
  // writer.pipe(fs.createWriteStream(csv_file));
  writer.pipe(pdf.output);
  console.log(pdf);
  // writer.pipe(res);
  
  for (var i in pdf.data.Pages) {
    console.log('page');
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
    for (var j in page.Texts) {
      var text = page.Texts[j];
      var T = text.R[0].T.trim();
      
      lineY = text.y;
      newLine = lineY !== lastLineY;
      
      if (newLine && ownerNameLines && ownerNameLine){
        if (!ownerNameLine.match(/^ NAME AND ADDRESS$/i)){
          ownerNameLines.push(ownerNameLine.trim());
          ownerNameLine = '';
        }
      }
      
      if (newPage && equal(text.x, 33.575) && T.match(/^\d{4}$/)){
        taxRollYear = T;
        newPage = false;
      }
      if (equal(text.y, 4.32) || equal(text.y, 37.2) || (equal(text.y, 3.195))){
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

      function pushLeases(){
        if (leaseNumber){
          leases.push({
            leaseNumber: leaseNumber,
            leases: leaseLines,
            DOI: DOI.trim(),
            interestType: interestType.trim(),
            operatorLines: operatorLines,
            appraisalType: appraisalType
          });
        }
        leaseLines = [];
        DOI = '';
        interestType = '';
        operatorLines = [];
        operatorLine = [];
        interestType = '';
        leaseLine = '';
        leaseNumber = '';
        appraisalType = ''
      }
      if (equal(text.x + convertToRel(text.w), 11.3) && T.match(/^\d+$/)){
        pushLeases();
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
        pushLeases();
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
  }
  pushLeases();
  printLines(writer, taxRollYear, ownerNumber, ownerNameLines, leases);
  writer.end()
  console.log('closed');
};

var _onPDFBinDataError = function (error) {
  console.log(error);
};

// var args = process.argv.slice(2);

// _.each(args, function(file){
//   pdfParser.loadPDF(file);
// });

var pdfParser = new PDFParser();
pdfParser.on('pdfParser_dataReady', _.bind(_onPDFBinDataReady, this));

pdfParser.on('pdfParser_dataError', _.bind(_onPDFBinDataError, this));

var express = require('express');
var multer = require('multer'),
  bodyParser = require('body-parser'),
  path = require('path');

var app = new express();
app.use(bodyParser.json());
var timeout = require('connect-timeout'); //express v4

var basicAuth = require('basic-auth-connect');
app.use(basicAuth('test', 'pass'));

app.use(timeout(1200000));
app.use(haltOnTimedout);

function haltOnTimedout(req, res, next){
  if (!req.timedout) next();
}
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.get('/', function(req, res){
  res.render('index');
});

var response;
app.post('/', multer({ dest: './uploads/'}).single('upl'), function(req,res){
  console.log(req.body); //form fields
  /* example output:
  { title: 'abc' }
   */
  console.log(req.file); //form files
  /* example output:
            { fieldname: 'upl',
              originalname: 'grumpy.png',
              encoding: '7bit',
              mimetype: 'image/png',
              destination: './uploads/',
              filename: '436ec561793aa4dc475a88e84776b1b9',
              path: 'uploads/436ec561793aa4dc475a88e84776b1b9',
              size: 277056 }
   */
  res.setHeader('Content-disposition', 'attachment; filename=' + req.file.originalname.replace(/\.PDF/i, '.csv'));
  res.set('Content-Type', 'text/csv');
  res.connection.setTimeout(0);
  console.log('parser');
  console.log(req.file.path);
  console.log(pdfParser);
  // res.pipe(pdfParser);
  // res.pipe(pdfParser);
  response = res;

  pdfParser.output = res;
  pdfParser.loadPDF(req.file.path);
  console.log('parser');
  // res.end();
});

var port = process.env.PORT || 3000;
app.listen( port, function(){ console.log('listening on port '+port); } );

// https://www.codementor.io/tips/9172397814/setup-file-uploading-in-an-express-js-application-using-multer-js