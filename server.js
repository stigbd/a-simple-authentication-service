'use strict';

let express = require('express');
let cors = require('cors');
let app = express();
let morgan = require('morgan');
let mongoose = require('mongoose');
let bodyParser = require('body-parser');
let User = require('./models/user');
let bcrypt = require('bcrypt');
let jsonwebtoken = require('jsonwebtoken');
let jwt = require('express-jwt');
let dotenv = require('dotenv').config();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan('combined'));
app.use(cors());
mongoose.Promise = global.Promise;

// Set up mongodb connection
let dbConnectionString =
  'mongodb://'
  + process.env.DBHOST
  + ':'
  + process.env.DBPORT
  + '/'
  + process.env.DATABASE;
mongoose.connect(dbConnectionString, {useMongoClient: true})
  .catch(function(error){
    console.error('Error connecting to mongodb: ', error.message);
  });

// ===== Public Routes =====

// Get root
app.get('/', (req, res) => {
  res.send('hello world, from a simple authentication service');
});

// Create a new user
app.post('/user', function(req, res){
  var passwordToSave = bcrypt.hashSync(req.body.password, 10);
  let user = new User({
    email: req.body.email,
    password: passwordToSave,
    admin: req.body.admin,
    name: req.body.name
  });
  user.save(function(err, data){
    if(err){
      return res.json({error: true});
    }
    res.status(201).location('/user/' + user.id).send();
  });
});

// Authenticate a user given email and password:
app.post('/authenticate', function(req, res){
  let data = {
    email: req.body.email
  };
  User.findOne(data).lean().exec(function(err, user){
    if(err){
      return res.json({error: true});
    }
    if(!user){
      return res.status(404).json({'message':'User not found'});
    }
    if(!bcrypt.compareSync(req.body.password, user.password)){
      return res.status(404).json({'message': 'Password does not match'});
    }
    console.log(user);
    var payload = {
      name: user.name,
      email: user.email,
      admin: user.admin
    };
    let token = jsonwebtoken.sign(payload, process.env.SECRET, {
      expiresIn: 1440 // expires in 1 hour
    });
    res.json({error: false, token: token});
  })
});

// ===== Protected Routes =====
var auth = jwt({ secret: process.env.SECRET});

// Get a list of users
// Only users with admin-role should have access to this
app.get('/user', auth, (req, res) => {
  if(!req.user.admin) {
   return res.status(403).send();
  }
  User.find({}, function(err, users) {
    var userMap = {};
    users.forEach(function(user) {
      var payload = {
        id: user.id,
        name: user.name,
        email: user.email,
        admin: user.admin
      };
      userMap[user._id] = payload;
    });
    res.send(userMap);
  });
});

// Get an individual user
// Only the user or an admin should have access to this
app.get('/user/:id', auth, (req, res) => {
  var id = req.params.id;
  User.findById(id, function(err, user) {
    if(!user){
      return res.status(404).send();
    }
    if(err){
      return res.status(500).json({'message': 'Internal server error'});
    }
    if(req.user.email !== user.email) {
      return res.status(401).send();
    }
    var payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      admin: user.admin
    };
    res.send(payload);
  });
});

// Update user (i.e. only name and password can be changed for now)
app.put('/user/:id', auth, (req, res) => {
  let user = User.findById(id, function(err, user) {
    if(err) {
      return res.status(500).json({'message': 'Internal server error'});
    }
    if(!user) {
      return res.status(404).send();
    }
    var passwordToSave = bcrypt.hashSync(req.body.password, 10);
    user.name = req.body.name;
    user.password = passwordToSave;
    user.save(function(err, data){
      if(err){
        return res.json({error: true});
      }
      res.status(201).location('/user/' + user.id).send();
    });
  })
  res.status(204).send();
});

// Delete a user.
// Only the user or an admin shold have access to this
app.delete('/user/:id', auth, (req, res) => {
  var id = req.params.id;
  User.findByIdAndRemove(id, function(err, user) {
    if(err){
      return res.status(500).json({'message': 'Internal server error'});
    }
    if(!user) {
      return res.status(404).send();
    }
    res.status(204).send();
  });
});

app.use(function (err, req, res, next) {
  if (err.name === 'UnauthorizedError') {
    res.status(401).send({'message': 'Invalid token'});
  }
});

app.listen(process.env.PORT);
console.log('Listening on ', process.env.HOST + ':' + process.env.PORT);
