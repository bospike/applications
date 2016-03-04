var _ = require('underscore'),
    PDFParser = require('pdf2json');
var fs = require('fs');
var csvWriter = require('csv-write-stream');
var writer = csvWriter();

var pdfParser = new PDFParser();

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
  writer.pipe(fs.createWriteStream('./out.csv'));
  
  for (var i in pdf.data.Pages) {
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
};

var _onPDFBinDataError = function (error) {
  console.log(error);
};

pdfParser.on('pdfParser_dataReady', _.bind(_onPDFBinDataReady, this));

pdfParser.on('pdfParser_dataError', _.bind(_onPDFBinDataError, this));

var pdfFilePath = '1.PDF';

// Load the pdf. When it is loaded your data ready function will be called.
pdfParser.loadPDF(pdfFilePath);