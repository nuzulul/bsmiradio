var app = require("express")();
var http = require("http").Server(app);
var io = require("socket.io")(http,{ cors: { origin: "https://bsmiradio.netlify.app" } });
const { spawnSync } = require('child_process');

const port = process.env.PORT || 3000;

var express = require('express');

app.use(express.static(__dirname));
//app.use(express.json());
//app.use(express.urlencoded({ extended: true }));

var Usercounter = 0;

app.get('/', function (req, res) {
    res.send('ok');
    console.log('request default');
});

app.get("/radio", function(req, res) {
  res.sendFile(__dirname + "/index.html");
});

app.get('/cron', function (req, res) {
    res.send('ok');
    console.log('request cron');
});

app.get('/restart', function (req, res) {    
    res.send('ok');
    console.log('restart');
});

app.post('/fetch', function (req, res) {
    console.log('request fetch');
    
    const myfetch = spawnSync("git", ["fetch","--all"]);

    const myreset = spawnSync("git", ["reset","--hard","origin/main"]);
          
    console.log('request fetch end');
    res.send('fetch ok');
});

app.get('/fetch', function (req, res) {
  res.send('ok');
});

const users = [];

const addUser = ({ id, name, room }) => {
  name = name;
  room = room;

  const existingUser = users.find(
    user => user.room === room && user.name === name
  );

  if (!name || !room) return { error: 'Username and room are required.' };
  //if (existingUser) return { error: 'Username already exists.' };

  if (existingUser)
  {
    console.log("exist:"+existingUser.id);
    const sids = io.of("/").adapter.sids;
    const cek = sids.has(existingUser.id);
    if (cek)
    {
      return { error: 'Username already exists.' };
    }
    else
    {
      removeUser(existingUser.id);
    }
    
  }

  const user = { id, name, room };

  users.push(user);

  return { user };
};

const removeUser = id => {
  const index = users.findIndex(user => user.id === id);

  if (index !== -1) return users.splice(index, 1)[0];
};

const getUser = id => users.find(user => user.id === id);

const getUsersInRoom = room => users.filter(user => user.room === room);




io.on("connection", function(socket) {
  Usercounter = Usercounter + 1;
  io.emit("user", Usercounter);
  console.log("a user is connected");

  socket.on("disconnect", function() {

      Usercounter = Usercounter - 1;
      io.emit("user", Usercounter);
      console.log("user disconnected");

      const user = removeUser(socket.id);
      if (user) {
        io.to(user.room).emit('message', {
          user: 'adminX',
          text: `${user.name} has left.`
        });
        io.to(user.room).emit('roomData', {
          room: user.room,
          users: getUsersInRoom(user.room)
        });
        
        io.to(user.room).emit('removePeer', socket.id); 
      }      
         
  });

  socket.on('join', ({ username, room }, callback) => {
    const { error, user } = addUser({ id: socket.id, name: username, room }); // add user with socket id and room info

    if (error) return callback(error);

    socket.join(user.room);

    socket.emit('message', {
      user: 'adminX',
      text: `${user.name}, Welcome to ${user.room} room.`
    });
    socket.broadcast.to(user.room).emit('message', {
      user: 'adminX',
      text: `${user.name} has joined!`
    });

    io.to(user.room).emit('roomData', {
      room: user.room,
      users: getUsersInRoom(user.room) // get user data based on user's room
    });

    callback();
  });

  socket.on('joinfrequency', ({ username, room }, callback) => {

    const myuser = removeUser(socket.id);

    if (myuser) {
      socket.leave(myuser.room);
      io.to(myuser.room).emit('message', {
        user: 'adminX',
        text: `$my{user.name} has left.`
      });
      io.to(myuser.room).emit('roomData', {
        room: myuser.room,
        users: getUsersInRoom(myuser.room)
      });
    } 

    const { error, user } = addUser({ id: socket.id, name: username, room }); // add user with socket id and room info

    if (error) return callback(error);

    socket.join(user.room);

    socket.emit('message', {
      user: 'adminX',
      text: `${user.name}, Welcome to ${user.room} room.`
    });
    socket.broadcast.to(user.room).emit('message', {
      user: 'adminX',
      text: `${user.name} has joined!`
    });

    io.to(user.room).emit('roomData', {
      room: user.room,
      users: getUsersInRoom(user.room) // get user data based on user's room
    });

    callback();
  });

  socket.on('sendMessage', (message, callback) => {
    const user = getUser(socket.id);

    io.to(user.room).emit('message', { user: user.name, text: message });

    callback();
  });

  socket.on("availability", function(message,sfrequency,username) {
   //socket.join(sfrequency);
   //io.to(sfrequency).emit("availability", message);
   socket.to(sfrequency).emit("availability", message,username,socket.id);
   console.log(sfrequency,message)

  });

  socket.on("pttblock", function(message,sfrequency) {
   //socket.join(sfrequency);
   socket.to(sfrequency).emit("pttblock", message);
   console.log(sfrequency,message)
  });

  socket.on("scanrf", function(sfrequency) {
   //socket.join(sfrequency);
   var message = getUsersInRoom(sfrequency)
   socket.emit("scanrf", message);
   console.log(sfrequency, message)
  });

  socket.on("ping", function(message) {
   socket.emit("ping", message);
   console.log(message)
  });

  socket.on("audioMessage", function(msg,frequency,echo,mysocket,username) {
   if (isNaN(frequency) || frequency < 10 || frequency > 99) {
   console.log("Client try something new.")
  } else {
   //socket.join(frequency);
   io.to(frequency).emit("audioMessage", msg,echo,mysocket,username);
   console.log("Sended to",frequency)
  } 
  });

  socket.on("initReceive", function(sfrequency) {
    socket.to(sfrequency).emit("initReceive", socket.id);
  });

  socket.on("removePeer", function(sfrequency) {
    socket.to(sfrequency).emit('removePeer', socket.id);
  });

  socket.on('signal', data => {
      console.log('sending signal from ' + socket.id + ' to ', data)
      socket.to(data.socket_id).emit('signal', {
          socket_id: socket.id,
          signal: data.signal
      })
  });

  socket.on('initSend', init_socket_id => {
      console.log('INIT SEND by ' + socket.id + ' for ' + init_socket_id)
      socket.to(init_socket_id).emit('initSend', socket.id)
  });

});


process.on('uncaughtException', err => {
  console.error('There was an uncaught error', err)
  process.exit(1) //mandatory (as per the Node.js docs)
})

http.listen(port, function() {
  console.log("listening to port: "+port);
});