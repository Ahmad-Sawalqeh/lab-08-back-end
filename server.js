'use strict';

require('dotenv').config();

const express = require('express');

const cors = require('cors');

const superagent = require('superagent');

const pg = require('pg');

const PORT = process.env.PORT;

const app = express();

// Database Connection Setup
const client = new pg.Client(process.env.DATABASE_URL);
client.on('error', err => { throw err; });

app.use(cors());

app.get('/location', locationinfo);

app.get('/weather', weatherinfo);

app.get('/events', eventinfo);







/**************************************/
// Location
/**************************************/
function locationinfo(request, response) {
  let city = request.query.data;
  let SQL = 'SELECT * FROM location WHERE search_query = $1 ;';
  let values = [city];
  client.query(SQL,values)
    .then(results=>{
      if (results.rowCount) {
        console.log(city + ' already in our database');
        return response.status(200).json(results.rows[0]);
      }else{
        console.log(city + ' NOT in our database');
        getlocationinfo(city, response);
      }
    });

}
function getlocationinfo(city, response) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${city}&key=${process.env.GEOCODE_API_KEY}`;

  return superagent.get(url)
    .then( data => {
      return new Location(city, data.body);
    })
    .then( locationInstance => {
      let SQL = 'INSERT INTO location (search_query , formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4) RETURNING *;';//RETURNING *
      let safeValues = [locationInstance.search_query, locationInstance.formatted_query, locationInstance.latitude, locationInstance.longitude];
      client.query(SQL, safeValues)
        .then(results => {
          console.log('Now ' + results.rows[0].search_query + ' added to our database.');
          return response.status(200).json(results.rows[0]);
        });
    });
}
//to test location no local host : http://localhost:3000/location
function Location(city, data) {
  this.search_query = city;
  this.formatted_query = data.results[0].formatted_address;
  this.latitude = data.results[0].geometry.location.lat;
  this.longitude = data.results[0].geometry.location.lng;
}


/**************************************/
// Weather
/**************************************/
function weatherinfo(request, response) {
  getweatherinfo(request.query.data)
    .then( weatherData => response.status(200).json(weatherData) );
}
function getweatherinfo(query) {
  const url = `https://api.darksky.net/forecast/${process.env.DARKSKY_API_KEY}/${query.latitude},${query.longitude}`;

  return superagent.get(url)
    .then( data => {
      let weather = data.body;
      return weather.daily.data.map( (day) => {
        return new Weather(day);
      });
    });
}
//to test weather no local host : http://localhost:3000/weather?data[latitude]=31.9539494&data[longitude]=35.910635
function Weather(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toDateString();
}


/**************************************/
// Event
/**************************************/
function eventinfo(request, response) {
  geteventinfo(request.query.data.search_query)
    .then( eventData => response.status(200).json(eventData) );
}
function geteventinfo(city) {
  const url = `http://api.eventful.com/json/events/search?app_key=${process.env.EVENTBRITE_API_KEY}&location=${city}`;

  return superagent.get(url)
    .then( data => {
      let list = JSON.parse(data.text);
      if(list.events){
        return list.events.event.map( (day) => {
          return new Event(day);
        });
      }
    });
}
//to test events no local host : http://localhost:3000/events?data[search_query]=amman&data[formatted_query]=Amman, Jordan&data[latitude]=31.9539494&data[longitude]=35.910635
function Event(day) {
  this.link = day.url;
  this.name = day.title;
  this.event_date = day.start_time;
  this.summary = day.description;
}


/**************************************/
// Error
/**************************************/
app.use('*', (request, response) => {
  response.status(404).send('something goes wrong ');
});
app.use((error,request,response) => {
  response.status(500).send(error);
});


// Connect to DB and THEN Start the Web Server
client.connect()
  .then(() => {
    app.listen(PORT, () => console.log(`App Listening on ${PORT}`));
  })
  .catch(err => {
    throw `PG Startup Error: ${err.message}`;
  });
