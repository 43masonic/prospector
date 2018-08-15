'use strict';


//THIS IS THE TRAVEL DEMAND TOOL


/*
SFCTA PROSPECTOR: Data visualization platform.

Copyright (C) 2018 San Francisco County Transportation Authority
and respective authors. See Git history for individual contributions.

This program is free software: you can redistribute it and/or modify
it under the terms of the Apache License version 2.0, as published
by the Apache Foundation, or any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
See the Apache License for more details.

You should have received a copy of the Apache License along with
this program. If not, see <https://www.apache.org/licenses/LICENSE-2.0>.
*/

// Must use npm and babel to support IE11/Safari
import 'isomorphic-fetch';
import Cookies from 'js-cookie';
//import App from './App'

import VueInputAutowidth from 'vue-input-autowidth'
Vue.use(VueInputAutowidth);

var maplib = require('../jslib/maplib');
let styles = maplib.styles;
let getLegHTML = maplib.getLegHTML;
let mymap = maplib.sfmap;
var numeral = require('numeral');
var leafletPip = require('@mapbox/leaflet-pip');
//leafletPip.bassackwards = true;

mymap.setView([37.76889, -122.440997], 12);


// some important constant variables.
const CTA_API_SERVER = 'https://api.sfcta.org/api/';
const DISTRICTS_URL = 'tia_dist12';
const TRIP_DISTRIBUTION = 'tia_distribution';
const TRIP_GEN_RTS = 'tia_tripgen';
const MODE_SPLITS = 'tia_modesplit';
const PLANNING_GEOCODER_baseurl = 'http://sfplanninggis.org/cpc_geocode/?search=';
const AVO_DATA = 'tia_avo';

let geoDistricts;
let distributionData;
queryServer(CTA_API_SERVER + TRIP_DISTRIBUTION)
.then(function(data) {
  distributionData = data;

})

let mapLegend;

let modeSplits;
queryServer(CTA_API_SERVER + MODE_SPLITS)
.then(function(data){
  modeSplits = data;
  
})

let tripGenRates;
queryServer(CTA_API_SERVER + TRIP_GEN_RTS)
.then(function(data) {
  tripGenRates = data;
  app.ret_tripgen_daily = numeral(tripGenRates[3].daily_rate).format('0.0');
  app.res_tripgen_daily = numeral(tripGenRates[1].daily_rate).format('0.0');
  app.rest_tripgen_daily = numeral(tripGenRates[6].daily_rate).format('0.0')
  app.off_tripgen_daily = numeral(tripGenRates[0].daily_rate).format('0.0');
  app.sup_tripgen_daily = numeral(tripGenRates[4].daily_rate).format('0.0');
  app.hot_tripgen_daily = numeral(tripGenRates[2].daily_rate).format('0.0')

  app.ret_tripgen_PM = numeral(tripGenRates[3].pkhr_rate).format('0.0');
  app.res_tripgen_PM = numeral(tripGenRates[1].pkhr_rate).format('0.0');
  app.rest_tripgen_PM = numeral(tripGenRates[6].pkhr_rate).format('0.0');
  app.off_tripgen_PM = numeral(tripGenRates[0].pkhr_rate).format('0.0');
  app.sup_tripgen_PM = numeral(tripGenRates[4].pkhr_rate).format('0.0');
  app.hot_tripgen_PM = numeral(tripGenRates[2].pkhr_rate).format('0.0');
})

let AVO_data;
queryServer(CTA_API_SERVER + AVO_DATA)
.then(function(data){
  AVO_data = data;
  
  
})

let color_styles = [{ normal  : {"color": "#39f", "weight":3,  "opacity": 0.5},
selected: {"color": "#33f",    "weight":4, "opacity": 0.5 },},
{ normal  : {"fillColor": "#8B0000 ", "fillOpacity": 0.8 },
selected: {"color": "#34784b", "weight":5, "opacity": 1.0, },},
{normal: {"fillColor": "#000", "fillOpacity": 0.8, },
selected: {"color": "#000", "weight":5, "opacity": 1.0,},},
{normal: {"color": "#969696", "fillColor": "#969696", "fillOpacity": 0.3, "weight":2, "opacity": 1,},
selected: {"color": "#43C1FC", "weight":1, "opacity": 1,},},
];

//some global geolayer variables
let address_geoLyr;
let addressGroup;
let districts;
let districts_lyr;
let markers = []; //this is the list of all the district markers
let color_func;


//some other global variables
let addressDistrictNum; 
let addressDistrictName;
let modeSelect;
let address; 
let landUseCheck = false; //starts out as false and is set to true on the first time a user
  //selects a land use. it communicates that at least one land use has been specified by the user, enabling computation
  let tripPurposeSelect; 
  let tripDirectionSelect;
  let timePeriodSelect;
  let namePopup;



  let info = L.control(); 

  info.onAdd = function (map) {
this._div = L.DomUtil.create('div', 'info'); // create a div with a class "info"
this.update();
return this._div;
};



info.update = function (hoverDistrict) { //hoverDistrict is the mouseover target defned in updateMap
  if (addressDistrictNum == null && hoverDistrict == null) {
    this._div.innerHTML = '<h4>Information</h4>' +
    '<b> Input project details </b>'
  }
  else if (hoverDistrict == null) {
    this._div.innerHTML = '<h4>Information</h4>' +
    '<b> Hover over a district </b>'
  }
  else if (addressDistrictNum == null) {
    this._div.innerHTML = '<h4>Information</h4>' +
    '<b> Input an address to see trip distribution for: '+ hoverDistrict.distname +  '</b>' 
  }

  else if (landUseCheck == false) {
    this._div.innerHTML = '<h4>Information</h4>' +
    '<b> Select a land use to see trip distribution for: '+ hoverDistrict.distname +  '</b>'
  }

  else if (modeSelect == null) {
    this._div.innerHTML = '<h4>Information</h4>' +
    '<b> Select a mode to see trip distribution for: '+ hoverDistrict.distname +  '</b>'
  }

  else if (tripPurposeSelect == null) {
    this._div.innerHTML = '<h4>Information</h4>' +
    '<b> Select a trip purpose to see trip distribution for: '+ hoverDistrict.distname +  '</b>'
  }

  
  else {
    let text;

    if (tripDirectionSelect == "outbound"){

      text = '<h4> Outbound trips</h4>' +
      'For selected categories based on the proposed project land use inputs'+
      '<br>' + 'from ' +  address  + ' to ' + hoverDistrict.distname.toString()+
      '<br>' + "Person trips: "+ "<b>" +  Math.round(districtPersonTrips[hoverDistrict.dist]["total"])+'</b>';
      
      if (modeSelect !== "transit"){
        text += '<br>' + "Vehicle trips: "+ "<b>"+ Math.round(districtVehicleTrips[hoverDistrict.dist]["total"])+'</b>';
        
      }
      this._div.innerHTML = text;
    }
    else if (tripDirectionSelect == "inbound"){

      text = '<h4>Inbound Trips</h4>' +
      'For selected categories based on the proposed project land use inputs'+
      '<br>' + 'from ' +  hoverDistrict.distname.toString()  + ' to ' + address+
      '<br>' + "Person trips: "+ "<b>"+ Math.round(districtPersonTrips[hoverDistrict.dist]["total"])+'</b>';

      if (modeSelect !== "transit"){
       text += '<br>' + "Vehicle trips: "+ "<b>"+ Math.round(districtVehicleTrips[hoverDistrict.dist]["total"])+'</b>';
       
     }
     this._div.innerHTML = text;
   }
   else if (tripDirectionSelect == "both"){
    text = '<h4>Total Trips</h4>' +
    'For selected categories based on the proposed project land use inputs'+
    '<br>' + 'between ' +  address  + ' and ' + hoverDistrict.distname.toString()+
    '<br>' + "Person trips: "+ "<b>"+ Math.round(districtPersonTrips[hoverDistrict.dist]["total"])+'</b>';

    if (modeSelect !== "transit"){
     text += '<br>' + "Vehicle trips: "+ "<b>"+ Math.round(districtVehicleTrips[hoverDistrict.dist]["total"])+'</b>';
     
   }
   this._div.innerHTML = text;

 }


}

};
info.addTo(mymap);






function queryServer(url){
  var promise = new Promise(function(resolve, reject) {
    fetch(url)
    .then((resp) => resp.json())
    .then(function(jsonData) {
      resolve(jsonData)
    })
    .catch(function(error) {

      alert("Cannot query server");
    });
  })
  return promise
}


function planningJson2geojson(json) {
  //converts the response json of the planning geocoder into a geojson format that is readable by leaflet
  //allows this data to be added to a geoLayer and drawn on the map  
  let geoCodeJson = {};
  geoCodeJson['blklot'] = json.features[0].attributes.blklot;
  geoCodeJson['type'] = 'Feature';
  geoCodeJson['geometry'] = {};
  geoCodeJson['geometry']['type'] = 'MultiPolygon';
  geoCodeJson['geometry']['coordinates'] = [json.features[0].geometry.rings];
  return geoCodeJson;  
  
}


function ctaJson2geojson(json) {
  //converts the response json of the sfcta api into a geojson format that is readable by leaflet
  //allows this data to be added to a geoLayer and drawn on the map
  json["type"] = "Feature";
  json["geometry"] = JSON.parse(json.geometry);
  
}

function addGeoLayer(geoJsonData){
  let districtMarker;
  let tooltip_positions = {
    1: [37.799981, -122.412459],
    2: [37.775795, -122.407478],
    3: [37.789693, -122.441499],
    4: [37.760652, -122.400000],
    5: [37.737820, -122.445233],
    6: [37.730118, -122.389315],
    7: [37.776303, -122.499615],
    8: [37.745433, -122.498202],
    9: [37.825639, -122.371648],
    10: [37.596137, -122.403582],
    11: [37.810595, -122.288403],
    12: [37.835095, -122.493132] };
  let geolyr = L.geoJSON(geoJsonData,{ //this makes a geoJSON layer from
    //geojson data, which is required input. i is the style input
    style: color_styles[3].normal, 
    onEachFeature: function(feature, layer) { 
      layer.on({
        mouseover: function(e){
          //e.target.setStyle(color_styles[3].normal);
          e.target.bringToFront(); 
          if (districtMarker){
            districtMarker.unbindTooltip();
            mymap.removeLayer(districtMarker);
          }
          districtMarker = L.circleMarker(tooltip_positions[feature.dist], {color: 'blue', radius: 1}).addTo(mymap).bindTooltip(feature.distname, {permanent:true, sticky: true});
          if (address_geoLyr) { //this causes an error in clearAllInputs. it looks like this is an unsolved bug in leaflet, having to do with
          // accessing a layer once its been deleted
          // I'm proposing to get rid of the bringtoFront() functionality of the district polygons, since there is
          // no real reason they need to come to the front on mouseover anyway. This is a quick resolution of this problem.
          address_geoLyr.bringToFront();
        }
        info.update(e.target.feature); 
      },
      mouseout: function(e){
          //geolyr.resetStyle(e.target);
          //e.target.setStyle(color_styles[0].normal);
          //is there a way where i can do highlighting with both of these different color paradigms?

        },
      });
    }
  });
  
  geolyr.addTo(mymap); 

  return geolyr;
}

function getMax() {
  let distributions = [];
  if (modeSelect && landUseCheck && tripPurposeSelect && tripDirectionSelect && addressDistrictNum && timePeriodSelect
    && filterDistributionData(modeSelect, addressDistrictNum, "Retail", //these are hardcoded pending decision at meeting
    tripPurposeSelect, tripDirectionSelect).length !== 0){ //not sure if this last check is correct
    for (let key of Object.keys(districtPersonTrips)){
      distributions.push(districtPersonTrips[key]["total"]);
    }
    return Math.max.apply(null, distributions);

  }
  else {
    console.log("get max error possibly empty json filter");
  }

}

function filterDistributionData(mode, districtNum, landUse, purpose, direction) { 
  //returns a json object or list of json objects that fit given parameters   
  return distributionData.filter(function(piece){ 
    return piece.mode == mode && piece.dist == districtNum && piece.landuse == landUse && piece.purpose == purpose &&
    piece.direction == direction;
  }); 
}



function getDistProps(district, landUse) {

  let referenceDistrictProp = "prop_dist" + district.dist; //the name of the value that stores the 
  //relevant proportion from address district to hover district
  let referenceDistrict = "trips_dist" + district.dist;

  if (modeSelect && landUseCheck==true && tripPurposeSelect && tripDirectionSelect && addressDistrictNum){
    return filterDistributionData(modeSelect, addressDistrictNum, landUse, tripPurposeSelect, tripDirectionSelect)[0][referenceDistrictProp]; 
    
  }
  
}

function getDirectionProps(district, landUse) {
  let directionDistrictProp = "prop_" + tripDirectionSelect;
  //let referenceDistrict = "trips_dist" + district.dist;
  
  if (modeSelect && landUseCheck==true && tripPurposeSelect && tripDirectionSelect && addressDistrictNum){
    if (tripDirectionSelect == "both"){
      return 1; //I'm not sure if this is the right way to dea with the both directions. maybe need bhargav to add something to the API
    }
    else{


      return (filterDistributionData(modeSelect, addressDistrictNum, landUse, tripPurposeSelect, 
        tripDirectionSelect)[0][directionDistrictProp]); 

    }
    
  }
  

}

function filterModeSplitData(landUse, placetype){
  //trying to access the proportion that corresponds with a given land use, placetype and mode
  if (modeSelect && landUseCheck==true && app.placetype != ''){
    return modeSplits.filter(function(piece){
      return (piece.place_type == placetype && piece.landuse == landUse);
    });
    
  }
}

function filterAvoData(landUse, placetype){
  //trying to access the proportion that corresponds with a given land use, placetype and mode
  if (modeSelect && landUseCheck==true && app.placetype != ''){
    return AVO_data.filter(function(piece){                   //how to deal with land use?
      return (piece.geography == "Place Type "+ app.placetype);
    })[0][landUse];
    
  }
}




function getQuantile(arr, q) {
  console.log(arr.length);
  console.log(q);
  let index = Math.round(q*(arr.length));
  console.log('index')
  console.log(index)
  index = Math.min(index, (arr.length) - 1);
  return arr[index];
}






function updateMap() {
  if (address_geoLyr){
    mymap.removeLayer(address_geoLyr);
  }
  let district_colors = [];
  let labels = [0.2, 0.4, 0.6, 0.8, 1];
  address = app.address; // app.address is the user input. app refers to the VUE object below that handles
  let geocodedJson = queryServer(PLANNING_GEOCODER_baseurl+address, 0) //data has got to the geocoder
    .then(function(geocodedJson) { //after queryServer returns the data, do this:
      if (geocodedJson.features.length !== 0 && modeSelect && landUseCheck==true && tripPurposeSelect && 
        tripDirectionSelect && timePeriodSelect) {

        let geoJson = planningJson2geojson(geocodedJson); //this is the polygon
        address_geoLyr = L.geoJSON(geoJson,{ //this makes a geoJSON layer from geojson data, which is input
        style: color_styles[1].normal, //this is hardcoded to blue
        onEachFeature: function(feature, layer) { 

          layer.on({
            mouseover: function(e){
              //e.target.setStyle(color_styles[1].selected);
              //e.target.bringToFront();

            },
            mouseout: function(e){
              address_geoLyr.resetStyle(e.target);
            },
          });
        }

      });
      address_geoLyr.addTo(mymap); //adds the geoLayer to the map
      address_geoLyr.bringToFront();
      //why does this only work when i mouseover?
      address_geoLyr.bindTooltip(address, {permanent: true, className:'myCSSClass'}).addTo(mymap);
      assignDistrict(geoJson, address_geoLyr, address);
      getFilteredPersonTrips();

      //coloring the districts
      
      let trips = []
      districts_lyr.setStyle(function(feature){
        //color_func = chroma.scale(['#c6dbef', '#bdd7e7' ,'#6baed6','#3182bd','#08519c']).domain([0, getMax()], 5, 'quantiles');
        color_func = chroma.scale(['#eff3ff', '#bdd7e7' ,'#6baed6','#3182bd','#08519c']).domain([0, getMax()], 5, 'quantiles');

        //#ffffe0 #ffd59b #ffa474 #f47461 #db4551 #b81b34 #8b0000
        let tot_person_trips = districtPersonTrips[feature.dist]["total"];
        trips.push(tot_person_trips);

        district_colors.push(color_func(tot_person_trips)); //these are not in order of increasing color saturation, theyre just inorder of 
        //what district is first. districts do seem to be being colored correctly, so its in the legend that it is wrong. perhaps I should
        //make a dictionary of the quantile labels and their corresponding colors?
        if (trips.reduce((a, b) => a + b, 0) == 0){
          return {'color': '#444444', 'weight': 2, 'fillColor': '#c6dbef', fillOpacity:0.6};
        }
        else{
          return {'color': '#444444', 'weight': 2, 'fillColor': color_func(tot_person_trips), fillOpacity:0.6};
        }
             
      });
      
      trips.sort(function(a, b){return a - b});
      console.log(trips);
      
      let labels = [];
      let colors = [];
      let breakpoints = chroma.limits(trips, 'q', 3);
      let unique_breakpoints = breakpoints.filter((v, i, a) => a.indexOf(v) === i);
      
      for (let breakpoint of unique_breakpoints) {
        if (breakpoint == 0){
          labels.push(Math.round(breakpoint));
        }
        else{
          labels.push("<=" + Math.round(breakpoint));
        }
        
        
        if (unique_breakpoints.reduce((a, b) => a + b, 0) == 0){
          colors.push("#c6dbef"); 
        }
        else {
          colors.push(color_func(breakpoint));

        }
        
      }
      console.log(labels);
      console.log(breakpoints);
      console.log(unique_breakpoints);
      console.log(colors);



      //building and styling the legend for the districts
      if (mapLegend) mymap.removeControl(mapLegend);
      mapLegend = L.control({ position: 'bottomright' });

      mapLegend.onAdd = function(map) {
        let div = L.DomUtil.create('div', 'info legend');
        
        let units = [" "];
        //I am not sure that the colors correctly match
        let legHTML = getLegHTML(labels, colors, false, units);

        for (var i = 0; i < labels.length; i++) {

          div.innerHTML =
          '<h4>' + "Person Trips" + '</h4>' + legHTML;
        }
        return div;
      };

      mapLegend.addTo(mymap);





    }
    else {
      if (!(tripDirectionSelect)){
        alert("The trip direction is not defined.");
      }
      else if (!(tripPurposeSelect)){
        alert("The trip purpose is not defined.");
      }
      // else if (!(addressDistrictNum)){
      //   alert("Enter a valid address.");
      // }
      else if (!(modeSelect)){
        alert("The trip mode is not defined.");
      }
      else if (!(landUseCheck)){
        alert("Enter at least one land use type.");
      }
      else if (!(timePeriodSelect)){
        alert("Enter a time frame.");
      }
      else {
        alert("The address is invalid or is outside the city limits of San Francisco. Enter another address.");

      }
      
    }
    
  })
}





let trgen_download; //an array of dictionaries -> "a list of json"
let tdist_download;
let modesplit_download; 
let tdist_person_download;
let tdist_vehicle_download;
let total_person_dist;
let total_vehicle_dist;

function createDownloadObjects() {
  trgen_download = []; 
  tdist_download = [];
  modesplit_download = [];
  tdist_vehicle_download = [];
  total_person_dist = 0;
  total_vehicle_dist = 0;

  let tmp_dwld;
  let tmp_dwld_vehicle;
  
  let tot_bedrooms = app.num_studios+app.num_1bed+2*app.num_2bed+3*app.num_3bed;
  let tot_daily = 0;
  let tot_pm = 0;

    if(tot_bedrooms>0) { //if residential is activated
      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Residential';
      tmp_dwld['Amount'] = tot_bedrooms.toString();
      tmp_dwld['Unit'] = 'Per Bedroom';
      tmp_dwld['Daily_Person_Rate'] = app.res_tripgen_daily.toString();
      tmp_dwld['Daily_Person_Trips'] = (tot_bedrooms*app.res_tripgen_daily).toString();
      tot_daily += tot_bedrooms*app.res_tripgen_daily;
      tmp_dwld['PM_Person_Rate'] = app.res_tripgen_PM.toString();
      tmp_dwld['PM_Person_Trips'] = (tot_bedrooms*app.res_tripgen_PM).toString();
      tot_pm += tot_bedrooms*app.res_tripgen_PM;
      trgen_download.push(tmp_dwld);

      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Residential';
      tmp_dwld['transit modesplit'] = filterModeSplitData("Residential", app.placetype)[0]["transit"].toString();
      tmp_dwld['all auto modesplit'] = filterModeSplitData("Residential", app.placetype)[0]["auto"].toString();
      tmp_dwld['taxi modesplit'] = filterModeSplitData("Residential", app.placetype)[0]["taxi"].toString();
      modesplit_download.push(tmp_dwld);
      //create person trips object
      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Residential';
      for (let district of geoDistricts) {
        getFilteredPersonTrips(district);
        tmp_dwld[district.distname] = districtPersonTrips[district.dist]["Residential"].toString();
        total_person_dist += tmp_dwld[district.distname];
      }
      tdist_download.push(tmp_dwld);
      //create vehicle trips object
      tmp_dwld_vehicle = {};
      tmp_dwld_vehicle['Landuse'] = 'Residential';
      for (let district of geoDistricts) {
        getFilteredPersonTrips(district);
        tmp_dwld_vehicle[district.distname] = districtVehicleTrips[district.dist]["Residential"].toString();
      }
      tdist_vehicle_download.push(tmp_dwld_vehicle);
    }
    if(app.off_sqft>0) {
      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Office';
      tmp_dwld['Amount'] = app.off_sqft.toString();
      tmp_dwld['Unit'] = 'Per 1k sqft.';
      tmp_dwld['Daily_Person_Rate'] = app.off_tripgen_daily.toString();
      tmp_dwld['Daily_Person_Trips'] = (app.off_sqft*app.off_tripgen_daily).toString();
      tot_daily += app.off_sqft*app.off_tripgen_daily;
      tmp_dwld['PM_Person_Rate'] = app.off_tripgen_PM.toString();
      tmp_dwld['PM_Person_Trips'] = (app.off_sqft*app.off_tripgen_PM).toString();
      tot_pm += app.off_sqft*app.off_tripgen_PM;
      trgen_download.push(tmp_dwld);

      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Office';
      tmp_dwld['transit modesplit'] = filterModeSplitData("Office", app.placetype)[0]["transit"].toString();
      tmp_dwld['all auto modesplit'] = filterModeSplitData("Office", app.placetype)[0]["auto"].toString();
      tmp_dwld['taxi modesplit'] = filterModeSplitData("Office", app.placetype)[0]["taxi"].toString();
      modesplit_download.push(tmp_dwld);

      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Office';
      for (let district of geoDistricts) {
        getFilteredPersonTrips(district);
        tmp_dwld[district.distname] = districtPersonTrips[district.dist]["Office"].toString();
        total_person_dist += tmp_dwld[district.distname];
      }
      tdist_download.push(tmp_dwld);

      tmp_dwld_vehicle = {};
      tmp_dwld_vehicle['Landuse'] = 'Office';
      for (let district of geoDistricts) {
        getFilteredPersonTrips(district);
        tmp_dwld_vehicle[district.distname] = districtVehicleTrips[district.dist]["Office"].toString();
      }
      tdist_vehicle_download.push(tmp_dwld_vehicle);

    }
    if(app.ret_sqft>0) {
      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Retail';
      tmp_dwld['Amount'] = app.ret_sqft.toString();
      tmp_dwld['Unit'] = 'Per 1k sqft.';
      tmp_dwld['Daily_Person_Rate'] = app.ret_tripgen_daily.toString();
      tmp_dwld['Daily_Person_Trips'] = (app.ret_sqft*app.ret_tripgen_daily).toString();
      tot_daily += app.ret_sqft*app.ret_tripgen_daily;
      tmp_dwld['PM_Person_Rate'] = app.ret_tripgen_PM.toString();
      tmp_dwld['PM_Person_Trips'] = (app.ret_sqft*app.ret_tripgen_PM).toString();
      tot_pm += app.ret_sqft*app.ret_tripgen_PM;
      trgen_download.push(tmp_dwld);

      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Retail';
      tmp_dwld['transit modesplit'] = filterModeSplitData("Retail", app.placetype)[0]["transit"].toString();
      tmp_dwld['all auto modesplit'] = filterModeSplitData("Retail", app.placetype)[0]["auto"].toString();
      tmp_dwld['taxi modesplit'] = filterModeSplitData("Retail", app.placetype)[0]["taxi"].toString();
      modesplit_download.push(tmp_dwld);

      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Retail';
      for (let district of geoDistricts) {
        getFilteredPersonTrips(district);
        tmp_dwld[district.distname] = districtPersonTrips[district.dist]["Retail"].toString();
        total_person_dist += tmp_dwld[district.distname];
      }
      tdist_download.push(tmp_dwld);

      tmp_dwld_vehicle = {};
      tmp_dwld_vehicle['Landuse'] = 'Retail';
      for (let district of geoDistricts) {
        getFilteredPersonTrips(district);
        tmp_dwld_vehicle[district.distname] = districtVehicleTrips[district.dist]["Retail"].toString();
      }
      tdist_vehicle_download.push(tmp_dwld_vehicle);
    }
    if(app.rest_sqft>0) {
      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Restaurant';
      tmp_dwld['Amount'] = app.rest_sqft.toString();
      tmp_dwld['Unit'] = 'Per 1k sqft.';
      tmp_dwld['Daily_Person_Rate'] = app.rest_tripgen_daily.toString();
      tmp_dwld['Daily_Person_Trips'] = (app.rest_sqft*app.rest_tripgen_daily).toString();
      tot_daily += app.ret_sqft*app.rest_tripgen_daily;
      tmp_dwld['PM_Person_Rate'] = app.rest_tripgen_PM.toString();
      tmp_dwld['PM_Person_Trips'] = (app.rest_sqft*app.rest_tripgen_PM).toString();
      tot_pm += app.rest_sqft*app.rest_tripgen_PM;
      trgen_download.push(tmp_dwld);

      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Restaurant';
      tmp_dwld['transit modesplit'] = filterModeSplitData("Restaurant", app.placetype)[0]["transit"].toString();
      tmp_dwld['all auto modesplit'] = filterModeSplitData("Restaurant", app.placetype)[0]["auto"].toString();
      tmp_dwld['taxi modesplit'] = filterModeSplitData("Restaurant", app.placetype)[0]["taxi"].toString();
      modesplit_download.push(tmp_dwld);

      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Restaurant';
      for (let district of geoDistricts) {
        getFilteredPersonTrips(district);
        tmp_dwld[district.distname] = districtPersonTrips[district.dist]["Restaurant"].toString();
        total_person_dist += tmp_dwld[district.distname];
      }
      tdist_download.push(tmp_dwld);

      tmp_dwld_vehicle = {};
      tmp_dwld_vehicle['Landuse'] = 'Restaurant';
      for (let district of geoDistricts) {
        getFilteredPersonTrips(district);
        tmp_dwld_vehicle[district.distname] = districtVehicleTrips[district.dist]["Restaurant"].toString();
      }
      tdist_vehicle_download.push(tmp_dwld_vehicle);
    }
    if(app.hot_sqft>0) {
      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Hotel';
      tmp_dwld['Amount'] = app.hot_sqft.toString();
      tmp_dwld['Unit'] = 'Per 1k sqft.';
      tmp_dwld['Daily_Person_Rate'] = app.hot_tripgen_daily.toString();
      tmp_dwld['Daily_Person_Trips'] = (app.hot_sqft*app.hot_tripgen_daily).toString();
      tot_daily += app.ret_sqft*app.hot_tripgen_daily;
      tmp_dwld['PM_Person_Rate'] = app.hot_tripgen_PM.toString();
      tmp_dwld['PM_Person_Trips'] = (app.hot_sqft*app.hot_tripgen_PM).toString();
      tot_pm += app.hot_sqft*app.hot_tripgen_PM;
      trgen_download.push(tmp_dwld);

      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Hotel';
      tmp_dwld['transit modesplit'] = filterModeSplitData("Hotel", app.placetype)[0]["transit"].toString();
      tmp_dwld['all auto modesplit'] = filterModeSplitData("Hotel", app.placetype)[0]["auto"].toString();
      tmp_dwld['taxi modesplit'] = filterModeSplitData("Hotel", app.placetype)[0]["taxi"].toString();
      modesplit_download.push(tmp_dwld);

      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Hotel';
      for (let district of geoDistricts) {
        getFilteredPersonTrips(district);
        tmp_dwld[district.distname] = districtPersonTrips[district.dist]["Hotel"].toString();
        total_person_dist += tmp_dwld[district.distname];
      }
      tdist_download.push(tmp_dwld);

      tmp_dwld_vehicle = {};
      tmp_dwld_vehicle['Landuse'] = 'Hotel';
      for (let district of geoDistricts) {
        getFilteredPersonTrips(district);
        tmp_dwld_vehicle[district.distname] = districtVehicleTrips[district.dist]["Hotel"].toString();
      }
      tdist_vehicle_download.push(tmp_dwld_vehicle);


    }
    if(app.sup_sqft>0) {
      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Supermarket';
      tmp_dwld['Amount'] = app.sup_sqft.toString();
      tmp_dwld['Unit'] = 'Per 1k sqft.';
      tmp_dwld['Daily_Person_Rate'] = app.sup_tripgen_daily.toString();
      tmp_dwld['Daily_Person_Trips'] = (app.sup_sqft*app.sup_tripgen_daily).toString();
      tot_daily += app.ret_sqft*app.sup_tripgen_daily;
      tmp_dwld['PM_Person_Rate'] = app.sup_tripgen_PM.toString();
      tmp_dwld['PM_Person_Trips'] = (app.sup_sqft*app.sup_tripgen_PM).toString();
      tot_pm += app.sup_sqft*app.sup_tripgen_PM;
      trgen_download.push(tmp_dwld);

      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Supermarket';
      tmp_dwld['transit modesplit'] = filterModeSplitData("Supermarket", app.placetype)[0]["transit"].toString();
      tmp_dwld['all auto modesplit'] = filterModeSplitData("Supermarket", app.placetype)[0]["auto"].toString();
      tmp_dwld['taxi modesplit'] = filterModeSplitData("Supermarket", app.placetype)[0]["taxi"].toString();
      modesplit_download.push(tmp_dwld);

      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Supermarket';
      for (let district of geoDistricts) {
        getFilteredPersonTrips(district);
        tmp_dwld[district.distname] = districtPersonTrips[district.dist]["Supermarket"].toString();
        total_person_dist += tmp_dwld[district.distname];
      }
      tdist_download.push(tmp_dwld);

      tmp_dwld_vehicle = {};
      tmp_dwld_vehicle['Landuse'] = 'Supermarket';
      for (let district of geoDistricts) {
        getFilteredPersonTrips(district);
        tmp_dwld_vehicle[district.distname] = districtVehicleTrips[district.dist]["Supermarket"].toString();
      }
      tdist_vehicle_download.push(tmp_dwld_vehicle);
    }
    trgen_download.push({'Landuse':'Total','Amount':'','Unit':'','Daily_Person_Rate':'',
      'Daily_Person_Trips':tot_daily.toString(),'PM_Person_Rate':'',
      'PM_Person_Trips':tot_pm.toString()});
  }


// information about rounding person trips:
//less than 100, nearest 10;
// between 100 and 199, nearest 20;
// …
// between 900 and 999, nearest 90;
// greater or equal than 1,000, nearest 100
function roundingTripGen(number) {
  let increment = 110;
  let numbers = {
    100: 10,
    199: 20,
    299: 30,
    399: 40,
    499: 50,
    599: 60,
    699: 70,
    799: 80,
    899: 90,
    999: 100,};
  //i think these instructions are a bit wrong, for the higher numbers. for now just test on numbers < 899
  for (var key in numbers){
    if (number < key){
      increment = numbers[key];
      break;
    }
  }    
  
  return Math.ceil(number / increment ) * increment;
}


let districtPersonTrips = {}; // {key = district number, value = person trips corresponding to this district}
let districtVehicleTrips = {};
//let landUses = ["Residential", "Retail", "Office","Restaurant", "Supermarket"];
//I'm changing this function so that instead of taking in a hoverDistrict parameter, it calculates the number of person trips for all 12 districts
//for all land uses and time periods
function getFilteredPersonTrips(){
  let num_studios = app.num_studios;
  let num_1bed = app.num_1bed;
  let num_2bed = app.num_2bed;
  let num_3bed = app.num_3bed;
  let tot_num_bedrooms = num_studios + num_1bed + (2*app.num_2bed) + (3*app.num_3bed); //these are added together as strings


  for (let district of geoDistricts) {
    let personTrips = {};
    let vehicleTrips = {};
    //have if statements here because only the computation for one time period needs to be done for each set of inputs. doing them
    //for both is a waste of computation

    //im trying this without dividing by 1000 because i think thats how it should work
    if (app.isPM ==true) {
      personTrips["Residential"] = roundingTripGen(((tripGenRates[1].pkhr_rate)*tot_num_bedrooms)*filterModeSplitData("Residential", app.placetype)[0][modeSelect]*getDirectionProps(district, "Residential")*getDistProps(district, "Residential"));
      personTrips["Retail"] = roundingTripGen((app.ret_sqft/1000)*(tripGenRates[3].pkhr_rate)*filterModeSplitData("Retail", app.placetype)[0][modeSelect]*getDirectionProps(district, "Retail")*getDistProps(district, "Retail"));
      personTrips["Office"] = roundingTripGen((app.off_sqft/1000)*(tripGenRates[0].pkhr_rate)*filterModeSplitData("Office", app.placetype)[0][modeSelect]*getDirectionProps(district, "Office")*getDistProps(district, "Office"));
      personTrips["Restaurant"] = roundingTripGen(((app.rest_sqft/1000)*(tripGenRates[6].pkhr_rate))*filterModeSplitData("Retail", app.placetype)[0][modeSelect]*getDirectionProps(district, "Retail")*getDistProps(district, "Retail")); //rest and sup use retail distribution
      personTrips["Supermarket"] = roundingTripGen(((app.sup_sqft/1000)*(tripGenRates[4].pkhr_rate))*filterModeSplitData("Retail", app.placetype)[0][modeSelect]*getDirectionProps(district, "Retail")*getDistProps(district, "Retail")); 
      personTrips["Hotel"] = roundingTripGen(((app.hot_sqft/1000)*(tripGenRates[2].pkhr_rate))*filterModeSplitData("Hotel", app.placetype)[0][modeSelect]*getDirectionProps(district, "Retail")*getDistProps(district, "Retail"));
      vehicleTrips["Residential"] = roundingTripGen(personTrips["Residential"]/(filterAvoData("residential", app.placetype)));
      vehicleTrips["Retail"] = roundingTripGen(personTrips["Retail"]/(filterAvoData("retail", app.placetype)));
      vehicleTrips["Hotel"] = roundingTripGen(personTrips["Hotel"]/(filterAvoData("retail", app.placetype)));
      vehicleTrips["Office"] = roundingTripGen(personTrips["Office"]/(filterAvoData("office", app.placetype)));
      vehicleTrips["Supermarket"] = roundingTripGen(personTrips["Supermarket"]/(filterAvoData("retail", app.placetype)));
    }

    else if (app.isDaily == true){
      personTrips["Residential"] = roundingTripGen(((tripGenRates[1].daily_rate)*tot_num_bedrooms)*filterModeSplitData("Residential", app.placetype)[0][modeSelect]*getDirectionProps(district, "Residential")*getDistProps(district, "Residential"));
      personTrips["Retail"] = roundingTripGen((app.ret_sqft/1000)*(tripGenRates[3].daily_rate)*filterModeSplitData("Retail", app.placetype)[0][modeSelect]*getDirectionProps(district, "Retail")*getDistProps(district, "Retail"));
      personTrips["Office"] = roundingTripGen((app.off_sqft/1000)*(tripGenRates[0].daily_rate)*filterModeSplitData("Office", app.placetype)[0][modeSelect]*getDirectionProps(district, "Office")*getDistProps(district, "Office"));
      personTrips["Restaurant"] = roundingTripGen(((app.rest_sqft/1000)*(tripGenRates[6].daily_rate))*filterModeSplitData("Retail", app.placetype)[0][modeSelect]*getDirectionProps(district, "Retail")*getDistProps(district, "Retail")); //rest and sup use retail distribution
      personTrips["Supermarket"] = roundingTripGen(((app.sup_sqft/1000)*(tripGenRates[4].daily_rate))*filterModeSplitData("Retail", app.placetype)[0][modeSelect]*getDirectionProps(district, "Retail")*getDistProps(district, "Retail")); 
      personTrips["Hotel"] = roundingTripGen(((app.hot_sqft/1000)*(tripGenRates[2].daily_rate))*filterModeSplitData("Hotel", app.placetype)[0][modeSelect]*getDirectionProps(district, "Retail")*getDistProps(district, "Retail")); 
      vehicleTrips["Residential"] = roundingTripGen(personTrips["Residential"]/(filterAvoData("residential", app.placetype)));
      vehicleTrips["Retail"] = roundingTripGen(personTrips["Retail"]/(filterAvoData("retail", app.placetype)));
      vehicleTrips["Hotel"] = roundingTripGen(personTrips["Hotel"]/(filterAvoData("retail", app.placetype)));
      vehicleTrips["Office"] = roundingTripGen(personTrips["Office"]/(filterAvoData("office", app.placetype)));
      vehicleTrips["Supermarket"] = roundingTripGen(personTrips["Supermarket"]/(filterAvoData("retail", app.placetype)));
    }
  //still in the for each district for loop
  personTrips["total"] = (personTrips["Residential"]+personTrips["Retail"]+personTrips["Office"]+personTrips["Restaurant"]+personTrips["Supermarket"]+personTrips["Hotel"]);
  districtPersonTrips[district.dist] = personTrips; //this creates a dictionary of dictionaries, with one dictionary for every district where the keys are the land uses/total
  //and the dictionary is populated by the time period
  vehicleTrips["total"] = vehicleTrips["Residential"] + vehicleTrips["Retail"]+ vehicleTrips["Hotel"] + 
  vehicleTrips["Office"] + vehicleTrips["Supermarket"];
  districtVehicleTrips[district.dist] = vehicleTrips;
  console.log(filterAvoData("office", app.placetype));
  console.log(filterAvoData("retail", app.placetype));
  console.log(districtVehicleTrips[district.dist]);
  
}

}


function clearAllInputs(){
  landUseCheck = false;
  app.isRetail = true;
  app.isResidential = false;
  app.isOffice = false;
  app.isRestaurant = false;
  app.isSupermarket = false;
  app.isHotel = false;
  app.isAUActive = false;
  app.isTRActive = false;
  app.address=  null;
  app.isOffice = false;
  app.isResidential = false;
  app.isRetail = false;
  app.isRestaurant = false;
  app.isSupermarket = false;
  app.isHotel = false;
  app.isWork = false;
  app.isOther = false;
  app.isAll = false;
  app.isInbound = false;
  app.isOutbound = false;
  app.isBoth = false;
  app.isDaily = false;
  app.isPM = false;
  app.isCombined = false;
  app.off_sqft = 0;
  app.ret_sqft = 0;
  app.res_sqft = 0;
  app.rest_sqft = 0;
  app.sup_sqft = 0;
  app.hot_sqft = 0;
  app.num_studios = 0;
  app.num_1bed = 0;
  app.num_2bed = 0;
  app.num_3bed = 0;
  app.isTaxiTNCActive = false;
  
  app.placetype = '';
  //this doesn't seem to be doing anything
  //districts_lyr.resetStyle(color_styles[0].normal);
  districts_lyr.setStyle(color_styles[3].normal);
  if (mapLegend) mymap.removeControl(mapLegend);
  if (address_geoLyr){
    mymap.removeLayer(address_geoLyr);
    //this works but removing the layer is not the ideal situation. I'd rather keep the layer and just recolor it.
    //mymap.removeLayer(districts_lyr);
  }
  info.update();
}
  


//button functions
function pickAU(thing){
  modeSelect = "auto";
  app.isAUActive = true;
  app.isTRActive = false;
  app.isTaxiTNCActive = false;
  

}
function pickTR(thing){
  modeSelect = "transit";
  app.isTRActive = true;
  app.isAUActive = false;
  app.isTaxiTNCActive = false;
  
}


function pickTaxiTNC(thing){
  modeSelect = "taxi";
  app.isTaxiTNCActive = true;
  app.isAUActive = false;
  app.isTRActive = false;
  
}

function pickRes(thing){
  landUseCheck = true; 
  app.isResidential = true;  
  app.isRetail = false;
  app.isOffice = false;
  app.isRestaurant = false;
  app.isSupermarket = false;
  app.isHotel = false;


}

function pickOffice(thing){
  landUseCheck = true;
  app.isOffice = true;
  app.isResidential = false;
  app.isRetail = false;
  app.isRestaurant = false;
  app.isSupermarket = false;
  app.isHotel = false;
  


}

function pickRet(thing){
  //landUseSelect = "Ret";
  landUseCheck = true;
  app.isRetail = true;
  app.isResidential = false;
  app.isOffice = false;
  app.isRestaurant = false;
  app.isSupermarket = false;
  app.isHotel = false;
  
}

function pickRestaurant(thing){
  landUseCheck = true;
  app.isRestaurant = true;
  app.isRetail = false;
  app.isResidential = false;
  app.isOffice = false;
  app.isSupermarket = false;
  app.isHotel = false;  
  

}

function pickHotel(thing){
  landUseCheck = true;
  app.isHotel = true;
  app.isRestaurant = false;
  app.isRetail = false;
  app.isResidential = false;
  app.isOffice = false;
  app.isSupermarket = false;
}

function pickSupermarket(thing){
  landUseCheck = true;
  app.isSupermarket = true;
  app.isRestaurant = false;
  app.isRetail = false;
  app.isResidential = false;
  app.isOffice = false;
  app.isHotel = false;
  
}

function pickWork(thing){
  tripPurposeSelect = "work";
  app.isWork = true;
  app.isOther = false;
  app.isAll = false;

}

function pickOther(thing){
  tripPurposeSelect = "other";
  app.isOther = true;
  app.isWork = false;
  app.isAll = false;
  
}

function pickAll(thing){
  tripPurposeSelect = "all";
  app.isOther = false;
  app.isWork = false;
  app.isAll = true;
  
}

function pickInbound(thing){
  tripDirectionSelect = "inbound";
  app.isInbound = true;
  app.isOutbound = false;
  app.isBoth = false;

}

function pickOutbound(thing){
  tripDirectionSelect = "outbound";
  app.isInbound = false;
  app.isOutbound = true;
  app.isBoth = false;
  
}


function pickBoth(thing){
  tripDirectionSelect = "both";
  app.isInbound = false;
  app.isOutbound = false;
  app.isBoth = true;
}

function pickPM(thing){
  timePeriodSelect = "PM";
  app.isPM = true;
  app.isDaily = false;
}

function pickDaily(thing){  
  timePeriodSelect = "daily";  
  app.isPM = false;
  app.isDaily = true;
}

function checkLandUseSelections() {
  
  app.resSelected = app.num_1bed > 0;
  app.resSelected = app.num_2bed > 0;
  app.resSelected = app.num_3bed > 0;
  app.resSelected = ((app.num_1bed+ app.num_2bed+ app.num_3bed) >0);
  app.offSelected = app.off_sqft > 0;
  app.restSelected = app.rest_sqft > 0;
  app.hotSelected = app.hot_sqft > 0;
  app.supSelected = app.sup_sqft > 0;
  app.retSelected = app.ret_sqft > 0;
  

}

// Vue object connects what is done in the user interface html to the javascript. All the buttons
// in the right side panel are connected here. 
let app = new Vue({
  el: '#panel', //element is 'el' the whole right side of the map
  delimiters: ['${', '}'],
  data: {
    isAUActive: false,
    isTRActive: false,
    address: null,
    isOffice: false,
    isResidential: false,
    isRetail: false,
    isRestaurant: false,
    isSupermarket: false,
    isHotel: false,
    isWork: false,
    isOther: false,
    isAll: false,
    isInbound: false,
    isOutbound: false,
    isBoth: false,
    isDaily: false,
    isPM: false,
    isCombined: false,
    off_sqft: 0,
    ret_sqft: 0,
    res_sqft: 0,
    rest_sqft: 0,
    sup_sqft: 0,
    hot_sqft: 0,
    num_studios: 0,
    num_1bed: 0,
    num_2bed: 0,
    num_3bed: 0,
    //tot_num_bedrooms:0,
    isTaxiTNCActive: false,
    inputs: false,
    placetype: '',
    ret_tripgen_daily: '',
    offSelected: false,
    resSelected: false,
    retSelected: false,
    restSelected: false,
    supSelected: false,
    hotSelected: false,


  },
  watch: {
    off_sqft: checkLandUseSelections,
    ret_sqft: checkLandUseSelections,
    
    rest_sqft: checkLandUseSelections,
    sup_sqft: checkLandUseSelections,
    hot_sqft: checkLandUseSelections,
    num_1bed: checkLandUseSelections,
    num_2bed: checkLandUseSelections,
    num_3bed: checkLandUseSelections,
  

  },
  
  methods: {
    clickToggleHelp: clickToggleHelp,
    clickToggleInstructions: clickToggleInstructions,
    pickAU: pickAU,
    pickTR: pickTR,
    updateMap: updateMap,
    clearAllInputs: clearAllInputs,

    pickOffice: pickOffice,
    pickRes: pickRes,
    pickRet: pickRet,
    pickRestaurant: pickRestaurant,
    pickSupermarket: pickSupermarket,
    pickHotel: pickHotel,
    pickWork: pickWork,
    pickOther: pickOther,
    pickAll: pickAll,
    pickInbound: pickInbound,
    pickOutbound: pickOutbound,
    pickBoth: pickBoth,
    pickTaxiTNC: pickTaxiTNC,
    pickDaily: pickDaily,
    pickPM: pickPM,
    // pickCombined: pickCombined,
    getFilteredPersonTrips: getFilteredPersonTrips,


  },
});

// eat some cookies -- so we can hide the help permanently
let cookieShowHelp = Cookies.get('showHelp');
function clickToggleHelp() {
  helpPanel.showHelp = !helpPanel.showHelp;

  // and save it for next time
  if (helpPanel.showHelp) {
    Cookies.remove('showHelp');
  } else {
    Cookies.set('showHelp', 'false', { expires: 365 });
  }
}

let helpPanel = new Vue({
  el: '#helpbox',
  data: {
    showHelp: cookieShowHelp == undefined,
  },
  methods: {
    clickToggleHelp: clickToggleHelp,
  },
  mounted: function() {
    document.addEventListener('keydown', e => {
      if (this.showHelp && e.keyCode == 27) {
        clickToggleHelp();
      }
    });
  },
});


let cookieInstructions = Cookies.get('showInstructions');
function clickToggleInstructions() {
  instructionsPanel.showInstructions = !instructionsPanel.showInstructions;

  // and save it for next time
  if (instructionsPanel.showInstructions) {
    Cookies.remove('showInstructions');
  } else {
    Cookies.set('showInstructions', 'false', { expires: 365 });
  }
}

let instructionsPanel = new Vue({
  el: '#instructionsBox',
  data: {
    showInstructions: cookieInstructions == undefined,
  },
  methods: {
    clickToggleInstructions: clickToggleInstructions,
  },
  mounted: function() {
    document.addEventListener('keydown', e => {
      if (this.showInstructions && e.keyCode == 27) {
        clickToggleInstructions();
      }
    });
  },
});

function assignDistrict(address, geoLayer, tooltipLabel) {
  //convert the address geojson to leaflet polygon
  let addressPolygon = L.polygon(address.geometry.coordinates[0]);
  //find the centroid of the address polygon
  let centroid = addressPolygon.getBounds().getCenter(); 
  let centroidArray = [centroid.lat, centroid.lng]; //reformat so that the lat/lon labels are correct
  //find out which districts contain the point
  let criticalDistrict = leafletPip.pointInLayer(centroidArray, districts_lyr);
  addressDistrictNum = criticalDistrict[0].feature.dist;
  addressDistrictName = criticalDistrict[0].feature.distname;
  //find out which place type the address district is in
  app.placetype = criticalDistrict[0].feature.place_type;

  return criticalDistrict;

}


function drawDistricts() {
  let districtName;
    for (let district of geoDistricts) { // in a for loop bc sfcta api returns a list of json for this one
    //calls json2geojson function to convert json data response to geojson
    ctaJson2geojson(district);
    districtName = district.distname;
    let districtPolygon = L.polygon(district.geometry.coordinates[0]);
    
  }
    districts_lyr = addGeoLayer(geoDistricts); //takes in a list of geoJson objects and draws them
  }

//save the geoDistricts data locally
queryServer(CTA_API_SERVER + DISTRICTS_URL)
.then(function(data) {
  geoDistricts = data;
  
  drawDistricts();
})



//this is the downloading part

window.downloadCSV = function(){
  createDownloadObjects();
  let data, filename, link;
  let csv = 'trip generation rates by land use and time';
  if (csv == null) return;
  csv += '\n'+ convertArrayOfObjectsToCSV({
    data: trgen_download
  });

  csv += '\n\n'+ 'mode split distribution';
  csv += '\n' + convertArrayOfObjectsToCSV({
    data: modesplit_download
  });
  
  csv += '\n\n '+ modeSelect+ ' person trips distribution by district';
  csv += '\n' + convertArrayOfObjectsToCSV({
    data: tdist_download
  });

  csv += '\n\n '+ modeSelect+ ' vehicle trips distribution by district';
  csv += '\n' + convertArrayOfObjectsToCSV({
    data: tdist_vehicle_download
  });



  filename = 'tdtool_dataexport.csv';
  if (!csv.match(/^data:text\/csv/i)) {
    csv = 'data:text/csv;charset=utf-8,' + csv;
  }
  data = encodeURI(csv);
  link = document.createElement('a');
  link.style.display = 'none';
  link.setAttribute('href', data);
  document.body.appendChild(link);
  link.setAttribute('download', filename);
  link.click();
  document.body.removeChild(link);
};

function convertArrayOfObjectsToCSV(args) {
  var result, ctr, keys, columnDelimiter, lineDelimiter, data;

  data = args.data || null;
  if (data == null || !data.length) {
    return null;
  }

  columnDelimiter = args.columnDelimiter || ',';
  lineDelimiter = args.lineDelimiter || '\n';

  keys = Object.keys(data[0]);

  result = '';
  result += keys.join(columnDelimiter);
  result += lineDelimiter;

  data.forEach(function(item) {
    ctr = 0;
    keys.forEach(function(key) {
      if (ctr > 0) result += columnDelimiter;

      result += item[key];
      ctr++;
    });
    result += lineDelimiter;
  });

  return result;
}






