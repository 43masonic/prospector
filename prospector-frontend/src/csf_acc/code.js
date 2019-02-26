'use strict';

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
import vueSlider from 'vue-slider-component';
import Cookies from 'js-cookie';

var maplib = require('../jslib/maplib');
let styles = maplib.styles;
let getLegHTML = maplib.getLegHTML2;
let getColorFromVal = maplib.getColorFromVal2;
// let getBWLegHTML = maplib.getBWLegHTML;
let getQuantiles = maplib.getQuantiles;

let mymap = maplib.sfmap;
// set map center and zoom level
mymap.setView([37.76889, -122.440997], 13);

// add baseLayer and streetLayer
let baseLayer = maplib.baseLayer;
mymap.removeLayer(baseLayer);
let url = 'https://api.mapbox.com/styles/v1/mapbox/light-v10/tiles/256/{z}/{x}/{y}?access_token={accessToken}';
let token = 'pk.eyJ1Ijoic2ZjdGEiLCJhIjoiY2ozdXBhNm1mMDFkaTJ3dGRmZHFqanRuOCJ9.KDmACTJBGNA6l0CyPi1Luw';
let attribution ='<a href="http://openstreetmap.org">OpenStreetMap</a> | ' +
                 '<a href="http://mapbox.com">Mapbox</a>';
baseLayer = L.tileLayer(url, {
  attribution:attribution,
  maxZoom: 18,
  accessToken:token,
}).addTo(mymap);

let url2 = 'https://api.mapbox.com/styles/v1/sfcta/cjscclu2q07qn1fpimxuf2wbd/tiles/256/{z}/{x}/{y}?access_token={accessToken}';
let streetLayer = L.tileLayer(url2, {
  attribution:attribution,
  maxZoom: 18,
  accessToken:token,
  pane: 'shadowPane',
});
streetLayer.addTo(mymap);

// add top layers
const ADDLAYERS = [
  {
    view: 'sup_district_boundaries', name: 'Supervisorial District Boundaries',
    style: { opacity: 1, weight: 3, color: 'purple', fillOpacity: 0, interactive: false},
  },
  {
    view: 'coc2017', name: 'Communities of Concern',
    style: { opacity: 1, weight: 0, color: 'grey', fillOpacity: 0.4, interactive: false},
  },
    {
    view: 'hin2017', name: 'High Injury Network',
    style: { opacity: 0.4, weight: 4, color: 'orange', interactive: false},
  },
]

// some important global variables.
// the data source
const API_SERVER = 'https://api.sfcta.org/api/';
const GEO_VIEW = 'taz_boundaries';
const DATA_VIEW = 'connectsf_accjobs';

// sidebar select lists
const FRAC_COLS = ['autototal']; //
const YR_LIST = [2015,2050];
const METRIC_DESC = {'autototal': 'Auto',
                    'transittotal': 'Transit'};

// color schema
const INT_COLS = []; //
const DISCRETE_VAR_LIMIT = 10; //
const MISSING_COLOR = '#ccd'; //
const COLORRAMP = {SEQ: ['#eaebe1','#D2DAC3','#7eb2b5','#548594','#003f5a'],
                   DIV: ['#d7191c','#fdae61','#ffffbf','#a6d96a','#1a9641']};
                  //  ACC: ['#eaebe1','#D2DAC3','#789174','#517350','#004415']
const CUSTOM_BP_DICT = {
  'transittotal': {'2015':[200, 400, 550, 650],
                   '2050':[300, 600, 750, 900],
                   'diff':[150, 200, 250, 300]},
  'autototal': {'2015':[900, 1000, 1100, 1200],
                '2050':[1000, 1100, 1200, 1300],
                'diff':[75, 125, 150, 175]},
}

// pre-def variables
const METRIC_UNITS = {}; //
let sel_colorvals, sel_colors, sel_binsflag;
let sel_bwvals;

let chart_deftitle = 'All TAZs Combined';

let geoLayer, mapLegend;
let _featJson;
let _aggregateData;
let prec;
let addLayerStore = {};

// main function
async function initialPrep() {

  console.log('1...');
  _featJson = await fetchMapFeatures();

  console.log('2... ');
  await drawMapFeatures();
  
  console.log('3... ');
  await buildChartHtmlFromData();
  
  console.log('4... ');
  await fetchAddLayers();

  console.log('5 !!!');
}

// get the taz boundary data
async function fetchMapFeatures() {
  const geo_url = API_SERVER + GEO_VIEW + '?taz=lt.1000&select=taz,geometry,nhood';

  try {
    let resp = await fetch(geo_url);
    let features = await resp.json();

    // do some parsing and stuff
    for (let feat of features) {
      feat['type'] = 'Feature';
      feat['geometry'] = JSON.parse(feat.geometry);
    }
    return features;

  } catch (error) {
    console.log('map feature error: ' + error);
  }
}

// get the top layers data
async function fetchAddLayers() {
  try {
    for (let item of ADDLAYERS) {
      let resp = await fetch(API_SERVER + item.view);
      let features = await resp.json();
      for (let feat of features) {
        feat['type'] = 'Feature';
        feat['geometry'] = JSON.parse(feat.geometry);
      }
      let lyr = L.geoJSON(features, {
        style: item.style,
        pane: 'shadowPane',
      }).addTo(mymap);
      addLayerStore[item.view] = lyr;
      mymap.removeLayer(lyr);
    }
  } catch (error) {
    console.log('additional layers error: ' + error);
  }
}

// hover panel -------------------
let infoPanel = L.control();

infoPanel.onAdd = function(map) {
  // create a div with a class "info"
  this._div = L.DomUtil.create('div', 'info-panel-hide');
  return this._div;
};

// hover infomation format
function getInfoHtml(geo) {
  // console.log(geo)
  let retval = '<b>TAZ: </b>' + `${geo.taz}<br/>` +
                '<b>NEIGHBORHOOD: </b>' + `${geo.nhood}<br/><hr>`;

  let metric1 = app.selected_metric + YR_LIST[0];
  let metric2 = app.selected_metric + YR_LIST[1];
  let diff = geo[metric2] - geo[metric1];

  retval += `<b>${YR_LIST[0]}</b> `+`<b>${METRIC_DESC[app.selected_metric]}: </b>` + `${geo[metric1]}<br/>` +
            `<b>${YR_LIST[1]}</b> `+`<b>${METRIC_DESC[app.selected_metric]}: </b>` + `${geo[metric2]}<br/>`+
            `<b>${METRIC_DESC[app.selected_metric]}</b>` + '<b> Change: </b>' + `${diff}`;
  return retval; 
}

// activate function
infoPanel.update = function(geo) {
  infoPanel._div.innerHTML = '';
  infoPanel._div.className = 'info-panel';
  if (geo) this._div.innerHTML = getInfoHtml(geo);

  infoPanelTimeout = setTimeout(function() {
    // use CSS to hide the info-panel
    infoPanel._div.className = 'info-panel-hide';
    // and clear the hover too
    if (oldHoverTarget.feature.taz != selGeoId) geoLayer.resetStyle(oldHoverTarget);
  }, 2000);
};
infoPanel.addTo(mymap);

// main map ------------------
// get data from database
async function getMapData() {
  let data_url = API_SERVER + DATA_VIEW;
  let resp = await fetch(data_url);
  let jsonData = await resp.json();

  base_lookup = {};
  let tmp = {};
  for (let yr of YR_LIST) {
    tmp[yr] = {};
    for (let met of app.metric_options) {
      tmp[yr][met.value] = 0;
    }
  }

  for (let entry of jsonData) {
    base_lookup[entry.taz] = entry;
    for (let yr of YR_LIST) {
      for (let met of app.metric_options) {
        tmp[yr][met.value] += entry[met.value+yr];
      }
    }
  }

  _aggregateData = [];
  for (let yr of YR_LIST) {
    let row = {};
    row['year'] = yr.toString();
    for (let met of app.metric_options) {
      row[met.value] = tmp[yr][met.value];
    }
    _aggregateData.push(row);
  }
  // console.log(_aggregateData)
}

let base_lookup;
let map_vals;
let bwidth_vals; //
async function drawMapFeatures(queryMapData=true) {

  // create a clean copy of the feature Json
  if (!_featJson) return;
  let cleanFeatures = _featJson.slice();
  let sel_metric = app.selected_metric;
  
  let base_metric = sel_metric + app.sliderValue[0];
  let comp_metric = sel_metric + app.sliderValue[1];

  // check selection mode for single year or diff
  if (base_metric==comp_metric) {
    app.comp_check = false;
  } else {
    app.comp_check = true;
  }
  prec = (FRAC_COLS.includes(sel_metric) ? 100 : 1); //???
  
  try {
    // draw data
    if (queryMapData) {
      // app.custom_check = false;
      if (base_lookup == undefined) await getMapData();
      // console.log(base_lookup)
      console.log("data draw!")
      
      let map_metric;
      map_vals = [];
      for (let feat of cleanFeatures) {
        map_metric = null;

        // get all the data first to show on hover
        if (base_lookup.hasOwnProperty(feat.taz)) {
          feat[sel_metric + YR_LIST[0]] = base_lookup[feat.taz][sel_metric + YR_LIST[0]];
          feat[sel_metric + YR_LIST[1]] = base_lookup[feat.taz][sel_metric + YR_LIST[1]];
        } 
        // console.log(feat)

        if (app.comp_check) {
          // changing num for time duration
          if (base_lookup.hasOwnProperty(feat.taz)) {
            // console.log("drawMapFeatures, 1")
            let feat_entry = base_lookup[feat.taz];
            map_metric = feat_entry[comp_metric] - feat_entry[base_metric];
          }
        } else {
          // base num for a year
          if (base_lookup.hasOwnProperty(feat.taz)) {
            // console.log("drawMapFeatures, 2")
            map_metric = base_lookup[feat.taz][base_metric];
          }
        }

        // ???
        if (map_metric !== null) {
          map_metric = Math.round(map_metric*prec)/prec;
          map_vals.push(map_metric);
        }
        feat['metric'] = map_metric;
      }
      // prepare for coloring
      map_vals = map_vals.sort((a, b) => a - b);
    }
    
    // draw map color
    if (map_vals.length > 0) {
      let color_func;
      let sel_colorvals2;
      let bp;

      console.log("color draw!")
      if (queryMapData) {
        sel_colorvals = Array.from(new Set(map_vals)).sort((a, b) => a - b);

        // if (sel_colorvals.length <= DISCRETE_VAR_LIMIT || INT_COLS.includes(sel_metric)) {
        //   console.log("drawMapFeatures, 3")
        //   sel_binsflag = false;
        //   color_func = chroma.scale(app.selected_colorscheme).mode(getColorMode(app.selected_colorscheme)).classes(sel_colorvals.concat([sel_colorvals[sel_colorvals.length-1]+1]));
        //   sel_colorvals2 = sel_colorvals.slice(0);
          
        //   app.bp0 = 0;
        //   app.bp1 = 0;
        //   app.bp2 = 0;
        //   app.bp3 = 0;
        //   app.bp4 = 0;
        //   app.bp5 = 1;
          
        // } else {
          console.log("drawMapFeatures, 4")
          // color schema breakpoints
          let mode = app.sliderValue[0];
          if (app.comp_check){
            mode = 'diff';
          }
          let custom_bps;
          // if (CUSTOM_BP_DICT.hasOwnProperty(sel_metric)){
            console.log("drawMapFeatures, 5")
            custom_bps = CUSTOM_BP_DICT[sel_metric][mode];
            sel_colorvals = [map_vals[0]];
            for (var i = 0; i < custom_bps.length; i++) {
              if (custom_bps[i]>map_vals[0] && custom_bps[i]<map_vals[map_vals.length-1]) sel_colorvals.push(custom_bps[i]);
            }
            sel_colorvals.push(map_vals[map_vals.length-1]);
            // app.custom_check = true;
          // } else {
          //   console.log("drawMapFeatures, 6")
          //   sel_colorvals = getQuantiles(map_vals, app.selected_breaks);
          // }
          bp = Array.from(sel_colorvals).sort((a, b) => a - b);
          app.bp0 = bp[0];
          app.bp5 = bp[bp.length-1];
          // if (CUSTOM_BP_DICT.hasOwnProperty(sel_metric)){
            app.bp1 = custom_bps[0];
            app.bp2 = custom_bps[1];
            app.bp3 = custom_bps[2];
            app.bp4 = custom_bps[3];
            if (custom_bps[0] < app.bp0) app.bp1 = app.bp0;
          // } else {
          //   app.bp1 = bp[1];
          //   app.bp4 = bp[bp.length-2];
          //   if (app.selected_breaks==3) {
          //     app.bp2 = app.bp3 = bp[2];
          //   } else {
          //     app.bp2 = bp[2];
          //     app.bp3 = bp[3];
          //   }
          // } 

          sel_colorvals = Array.from(new Set(sel_colorvals)).sort((a, b) => a - b);
          // updateColorScheme(sel_colorvals);
          sel_binsflag = true; 
          color_func = chroma.scale(app.selected_colorscheme).mode(getColorMode(app.selected_colorscheme)).classes(sel_colorvals);
          sel_colorvals2 = sel_colorvals.slice(0,sel_colorvals.length-1);
        // }
      } else {
        throw 'ERROR: This map does not support custom break points!!!';
        // sel_colorvals = new Set([app.bp0, app.bp1, app.bp2, app.bp3, app.bp4, app.bp5]);
        // sel_colorvals = Array.from(sel_colorvals).sort((a, b) => a - b);
        // updateColorScheme(sel_colorvals);
        // sel_binsflag = true; 
        // color_func = chroma.scale(app.selected_colorscheme).mode(getColorMode(app.selected_colorscheme)).classes(sel_colorvals);
        // sel_colorvals2 = sel_colorvals.slice(0,sel_colorvals.length-1);
        
        // sel_bwvals = new Set([app.bwbp0, app.bwbp1, app.bwbp2, app.bwbp3, app.bwbp4, app.bwbp5]);
        // sel_bwvals = Array.from(sel_bwvals).sort((a, b) => a - b);
      }
      
      sel_colors = [];
      for(let i of sel_colorvals2) {
        sel_colors.push(color_func(i).hex());
      }
 
      // activate color and hover func
      if (geoLayer) mymap.removeLayer(geoLayer);
      if (mapLegend) mymap.removeControl(mapLegend);
      geoLayer = L.geoJSON(cleanFeatures, {
        style: styleByMetricColor,
        onEachFeature: function(feature, layer) {
          layer.on({
            mouseover: hoverFeature,
            click: clickedOnFeature,
            });
        },
      });
      geoLayer.addTo(mymap);

      // legend for color schema
      mapLegend = L.control({ position: 'bottomright' });
      mapLegend.onAdd = function(map) {
        let div = L.DomUtil.create('div', 'info legend');
        let legHTML = getLegHTML(
          sel_colorvals,
          sel_colors,
          sel_binsflag,
        );
        legHTML = '<h4>' + sel_metric.toUpperCase()
                         + (METRIC_UNITS.hasOwnProperty(sel_metric)? (' (' + METRIC_UNITS[sel_metric] + ')') : '')
                         + '</h4>' + legHTML;
        div.innerHTML = legHTML;
        return div;
      };
      mapLegend.addTo(mymap);
      
      // plot chart?
      if (selectedGeo) {
        if (base_lookup.hasOwnProperty(selectedGeo.feature.taz)) {
          buildChartHtmlFromData(selectedGeo.feature.taz);
          return cleanFeatures.filter(entry => entry.taz == selectedGeo.feature.taz)[0];
        } else {
          resetPopGeo();
        }
      } else {
        buildChartHtmlFromData();
        return null;
      }
    }

  } catch(error) {
    console.log(error);
  }
}

// function updateColorScheme(colorvals) {
//   if (colorvals[0] * colorvals[colorvals.length-1] >= 0) {
//     app.selected_colorscheme = COLORRAMP.SEQ;
//   } else {
//     // app.selected_colorscheme = COLORRAMP.DIV;
//     app.selected_colorscheme = COLORRAMP.SEQ;
//   } 
// }

// map color style
function styleByMetricColor(feat) {
  let color = getColorFromVal(
              feat['metric'],
              sel_colorvals,
              sel_colors,
              sel_binsflag
              );
  if (!color) color = MISSING_COLOR;

  if (feat['metric']==0) {
    color = MISSING_COLOR;
  }
  return { fillColor: color, opacity: 1, weight: 1, color: color, fillOpacity: 1};
}

// hover mouseover
let infoPanelTimeout;
let oldHoverTarget;
function hoverFeature(e) {
  clearTimeout(infoPanelTimeout);
  infoPanel.update(e.target.feature);
  
  // don't do anything else if the feature is already clicked
  if (selGeoId === e.target.feature.taz) return;

  // return previously-hovered segment to its original color
  if (oldHoverTarget && e.target.feature.taz != selGeoId) {
    if (oldHoverTarget.feature.taz != selGeoId)
      geoLayer.resetStyle(oldHoverTarget);
  }

  let highlightedGeo = e.target;
  highlightedGeo.bringToFront();
  highlightedGeo.setStyle(styles.selected);
  oldHoverTarget = e.target; 
}

// hover clickon
let selGeoId;
let selectedGeo;
let prevSelectedGeo;
let selectedLatLng;
function clickedOnFeature(e) {
  e.target.setStyle(styles.popup);
  let geo = e.target.feature;
  selGeoId = geo.taz;

  // unselect the previously-selected selection, if there is one
  if (selectedGeo && selectedGeo.feature.taz != geo.taz) {
    prevSelectedGeo = selectedGeo;
    geoLayer.resetStyle(prevSelectedGeo);
  }
  selectedGeo = e.target;
  let selfeat = selectedGeo.feature;
  app.chartSubtitle = 'TAZ ' + selfeat.taz + ' in ' + selfeat.nhood;
  selectedLatLng = e.latlng;
  if (base_lookup.hasOwnProperty(selGeoId)) {
    showGeoDetails(selectedLatLng);
    buildChartHtmlFromData(selGeoId);
  } else {
    resetPopGeo();
  }
}

let popSelGeo;
function showGeoDetails(latlng) {
  // show popup
  popSelGeo = L.popup()
    .setLatLng(latlng)
    .setContent(infoPanel._div.innerHTML)
    .addTo(mymap);

  // Revert to overall chart when no segment selected
  popSelGeo.on('remove', function(e) {
    resetPopGeo();
  });
}

function resetPopGeo() {
  geoLayer.resetStyle(selectedGeo);
  prevSelectedGeo = selectedGeo = selGeoId = null;
  app.chartSubtitle = chart_deftitle;
  buildChartHtmlFromData();
}

// ????
function highlightSelectedSegment() {
  if (!selGeoId) return;

  mymap.eachLayer(function (e) {
    try {
      if (e.feature.taz === selGeoId) {
        e.bringToFront();
        e.setStyle(styles.popup);
        selectedGeo = e;
        return;
      }
    } catch(error) {}
  });
}

// chart ---------------------------
let trendChart = null
function buildChartHtmlFromData(geoid = null) {
  document.getElementById('longchart').innerHTML = '';
  if (geoid) {
    let selgeodata = [];
    for (let yr of YR_LIST) {
      let row = {};
      row['year'] = yr.toString();
      for (let met of app.metric_options) {
        row[met] = base_lookup[geoid][met+"total"+yr];
      }
      selgeodata.push(row);
    } 
    console.log(selgeodata)
    trendChart = new Morris.Line({
      data: selgeodata,
      element: 'longchart',
      gridTextColor: '#aaa',
      hideHover: true,
      labels: [app.selected_metric.toUpperCase()],
      lineColors: ['#f56e71'],
      xkey: 'year',
      smooth: false,
      parseTime: false,
      xLabelAngle: 45,
      ykeys: [app.selected_metric],
    });
  } else {
    trendChart = new Morris.Line({
      data: _aggregateData,
      element: 'longchart',
      gridTextColor: '#aaa',
      hideHover: true,
      labels: [app.selected_metric.toUpperCase()],
      lineColors: ['#f56e71'],
      xkey: 'year',
      smooth: false,
      parseTime: false,
      xLabelAngle: 45,
      ykeys: [app.selected_metric],
    });
  }
}

// functions for vue
async function selectionChanged(thing) {
  app.chartTitle = METRIC_DESC[app.selected_metric] + ' Trend';
  if (app.sliderValue && app.selected_metric) {
    let selfeat = await drawMapFeatures();
    console.log(selfeat)
    if (selfeat) {
      highlightSelectedSegment();
      popSelGeo.setContent(getInfoHtml(selfeat));
    }
  }
}

function yrChanged(yr) {
  app.selected_year = yr;
  if (yr=='diff') {
    app.sliderValue = YR_LIST;
  } else {
    app.sliderValue = [yr,yr];
  }
}

function metricChanged(metric) {
  app.selected_metric = metric;
}

function showExtraLayers(e) {
  for (let lyr in addLayerStore) {
    mymap.removeLayer(addLayerStore[lyr]);
  }
  for (let lyr of app.addLayers) {
    addLayerStore[lyr].addTo(mymap);
  }
}

function getColorMode(cscheme) {
  if (app.modeMap.hasOwnProperty(cscheme.toString())) {
    console.log("getColorMode 1!")
    return app.modeMap[cscheme];
  } else {
    console.log("getColorMode 2!")
    return 'lrgb';
  }
}

// function customBreakPoints(thing) {
//   if(thing) {
//     app.isUpdActive = false;
//   } else {
//     drawMapFeatures();
//   }
// }

// async function updateColor(thing) {
//   app.isUpdActive = false;
//   let selfeat = await drawMapFeatures(false);
//   if (selfeat) {
//     highlightSelectedSegment();
//     popSelGeo.setContent(getInfoHtml(selfeat));
//   }
// }

let app = new Vue({
  el: '#panel',
  delimiters: ['${', '}'],
  data: {
    isPanelHidden: false,

    // year
    year_options: [
      {text: 'Year 2015', value: '2015'},
      {text: 'Year 2050', value: '2050'},
      {text: 'Change', value: 'diff'},
      ],
    selected_year: '2015',
    sliderValue: [YR_LIST[0],YR_LIST[0]],
    comp_check: false,      // label for diff in time
    pct_check: false,

    // transit type
    selected_metric: 'autototal',
    metric_options: [
    {text: 'Auto', value: 'autototal'},
    {text: 'Transit', value: 'transittotal'},
    ],
    
    // top layers control
    addLayers:[],
    extraLayers: ADDLAYERS,

    // comment box
    comment: '',

    // title for chart
    chartTitle: 'Household Accessible Jobs TREND',
    chartSubtitle: chart_deftitle, 

    // map color control
    selected_colorscheme: COLORRAMP.SEQ,
    modeMap: {
      '#ffffcc,#663399': 'lch',
      '#ebbe5e,#3f324f': 'hsl',
      '#ffffcc,#3f324f': 'hsl',
      '#3f324f,#ffffcc': 'hsl',
      '#fafa6e,#2A4858': 'lch',
    },

    // test for color schema
    // custom_check: false,
    // custom break points
    // bp0: 0.0,
    // bp1: 0.0,
    // bp2: 0.0,
    // bp3: 0.0,
    // bp4: 0.0,
    // bp5: 0.0,
    // // update after change custom break points
    // isUpdActive: false,
  },
  watch: {
    sliderValue: selectionChanged,      // year choose
    selected_metric: selectionChanged,  // mode choose
    addLayers: showExtraLayers,         // top layers choose
  },
  methods: {
    yrChanged: yrChanged,               // year change
    metricChanged: metricChanged,       // mode change
    clickToggleHelp: clickToggleHelp,   // help box
    clickedShowHide: clickedShowHide,   // hide sidebar
  },
  components: { //
    vueSlider,  //
  },            //
});

let slideapp = new Vue({
  el: '#slide-panel',
  delimiters: ['${', '}'],
  data: {
    isPanelHidden: false,
  },
  methods: {
    clickedShowHide: clickedShowHide,
  },
});

function clickedShowHide(e) {
  slideapp.isPanelHidden = !slideapp.isPanelHidden;
  app.isPanelHidden = slideapp.isPanelHidden;
  // leaflet map needs to be force-recentered, and it is slow.
  for (let delay of [50, 100, 150, 200, 250, 300, 350, 400, 450, 500]) {
    setTimeout(function() {
      mymap.invalidateSize()
    }, delay)
  }
}

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

initialPrep();

// test
