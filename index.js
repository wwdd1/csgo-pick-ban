console.log("Runnning..")
const WebSocket = require("ws")
const uuid = require("uuid/v4")
const DB = require("./db.json")
const helpers = require("./helpers")
var http = require("http")
var express = require("express")
var app = express()
var port = process.env.PORT || 8081

app.use(express.static(__dirname + "/"))

var server = http.createServer(app)
server.listen(port)

DB.players = DB.players.map(p => ({
  ...p,
  active: true
}))

const wss = new WebSocket.Server({ server })

function Response(messageId, data) {
  this.messageId = messageId || ""
  this.data = data || ""
}

Response.prototype.json = function() {
  try {
    return JSON.stringify(this)
  } catch (e) {
    console.error("cannot stringify response object.")
    return ""
  }
}

function SessionMaster(id, player) {
  this.id = id
  this.player = player
  this.ws = null
}

function Session(id) {
  this.id = id
  this.masters = []
  this.actionStack = []
  this.picks = {} // keys is master id
  this.pickPhases = [{
    skillRange: 1,
    count: 2
  }, {
    skillRange: 2,
    count: 4
  }, {
    skillRange: 3,
    count: 2
  }]
  this.pickPhaseCount = this.pickPhases[0].count
  this.turn = 0
  this.pickPool = []
}

Session.prototype.getTotalPickedPlayersCount = function () {
  return Object.values(this.picks).flat(1).reduce(acc => acc += 1, 0) - 2 // minus master count
}

Session.prototype.getPickPhase = function () {
  return this.pickPhases.length > 0 ? this.pickPhases[0] : null
}

Session.prototype.setMasters = function (master0, master1) {
  session.masters[0] = master0
  session.masters[1] = master1
  this.picks[master0.id] = []
  this.picks[master1.id] = []
  this.turn = helpers.randomInt(0, 2)
}

Session.prototype.nextPickPhase = function () {
  this.pickPhases = this.pickPhases.slice(1, this.pickPhases.length)
  return this.getPickPhase()
}

let session = null
let sessionUpdateInterval = null

const broadcast = (wss, payload) => {
  let response = payload
  const isResponseInstance = payload instanceof Response
  if (!isResponseInstance && typeof payload === "object") {
    response = new Response(payload.messageId, payload.data).json()
  } else if (isResponseInstance){
    response = payload.json()
  }
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(response)
    }
  })
}

const broadcastUpdateSessionInfo = (wss, session) => {
  const picks = {}
  Object.keys(session.picks).forEach(masterId => {
    const master = session.masters.find(m => masterId.toString() === m.id.toString())
    picks[master.player.name] = session.picks[master.id]
  })
  broadcast(wss, new Response("sessionInfoUpdate", {
    masters: session.masters.map(m => m.player.name),
    picks,
    pickPool: session.pickPool,
    turn: session.masters[session.turn].player
  }))
}

const messageResponses = {
  playerList() {
    return {
      broadcast: false,
      data: DB.players
    }
  },
  createPlayer(data) {
    if (DB.players.some(p => p.name === data.name)) {
      return {
        broadcast: false,
        data: false
      }
    }
    DB.players.push({
      ...data,
      active: true
    })
    
    broadcast(wss, new Response("playerList", DB.players))

    return {
      broadcast: false,
      data: true
    }
  },
  createSession(data) {
    console.log("createSession: ", data)
    session = new Session(uuid())

    if (data && data.master0 && data.master1) {
      // masters from
      session.setMasters(
        new SessionMaster(uuid(), DB.players.find(p => p.name === data.master0)),
        new SessionMaster(uuid(), DB.players.find(p => p.name === data.master1))
      )
    } else {
      // pick masters
      const masterPlayers = helpers.pickMasters(DB.players)
      session.setMasters(
        new SessionMaster(uuid(), masterPlayers[0]),
        new SessionMaster(uuid(), masterPlayers[1])
      )
    }

    const skillRanges = [1, 1, 2, 2, 2, 2, 3, 3, 3, 3]
    session.pickPool = helpers
      .preparePickablePlayers(session, DB.players) // sorted desc skill
      .map((p, i) => ({
        ...p,
        skillRange: i < skillRanges.length ? skillRanges[i] : 0
      }))

    session.picks[session.masters[0].id].push(session.masters[0].player)
    session.picks[session.masters[1].id].push(session.masters[1].player)
    session.pickPool = helpers.evaluatePickPhase(session)

    setTimeout(() => {
      broadcast(wss, {
        messageId: "createSession",
        data: { newSessionCreated: true }
      });
    }, 1000)

    if (sessionUpdateInterval) {
      clearInterval(sessionUpdateInterval)
    }

    sessionUpdateInterval = setInterval(() => {
      broadcastUpdateSessionInfo(wss, session)
    }, 2000)

    broadcast(wss, new Response("playerList", DB.players))

    return {
      broadcast: false,
      data: session,
    }
  },
  sessionInfo() {
    return {
      broadcast: false,
      data: session
    }
  },
  sessionInfoForSpectator(sessionId) {
    if (sessionId !== session.id) {
      return {
        broadcast: false,
        data: {}
      }
    }
  },
  picked(data) {
    const masterId = data.master;
    const pickedPlayer = data.pickedPlayer;

    if (session.masters[session.turn].id !== masterId) {
      // not my turn
      return {
        broadcast: false,
        data: false
      }
    }

    if (session.picks[masterId].some(p => p.name === pickedPlayer.name)) {
      return {
        broadcast: false,
        data: false
      }
    }
    session.picks[masterId].push(pickedPlayer)
    session.turn = +!session.turn
    const removeIndex = session.pickPool.findIndex(p => p.name === pickedPlayer.name)
    session.pickPool.splice(removeIndex, 1)
    session.pickPool = helpers.evaluatePickPhase(session)

    if (session.pickPhaseCount - session.getTotalPickedPlayersCount() === 1) {
      const turnMasterId = session.masters[session.turn].id;
      const lastAutopickablePlayer = session.pickPool.shift()
      session.picks[turnMasterId].push(lastAutopickablePlayer)
      session.pickPool = helpers.evaluatePickPhase(session)
    }

    broadcastUpdateSessionInfo(wss, session)

    return {
      broadcast: false,
      data: true
    }
  },
  sessionInfoForMaster(masterId) {
    if (session && !session.masters.some(m => m.id === masterId)) {
      return {
        broadcast: false,
        data: {}
      }
    }
    return {
      broadcast: false,
      data: session
    }
  },
  playerActiveState(data) {
    console.log(data)
    DB.players = DB.players.map(p => ({
      ...p,
      active: data.player.name === p.name ? data.active : p.active
    }))
    return {
      broadcast: false,
      data: true
    }
  },
  masterConnected(data, ws) {
    console.log(data)
    if (!session) {
      return {
        broadcast: false,
        data: false
      }
    }
    return {
      broadcast: false,
      data: session.masters.some(m => m.id === data)
    }
  },
  spectatorConnected(data) {
    if (!session) {
      return {
        broadcast: false,
        data: false
      }
    }
    return {
      broadcast: false,
      data: session.id === data
    }
  }
}

wss.on("connection", (ws) => {
  console.log("wss is open.")

  ws.on("message", (message) => {
    console.log("wss got data!")
    console.log({ message })
    let arg = undefined
    let messageId = message
    const sepIndex = message.indexOf(";")
    console.log({ sepIndex })
    if (sepIndex != -1) {
      try {
        messageId = message.substring(0, sepIndex)
        arg = JSON.parse(message.substring(sepIndex + 1, message.length))
      } catch (e) {
        console.error(e)
      }
    }
    if (!messageResponses.hasOwnProperty(messageId)) {
      return
    }
    const payload = messageResponses[messageId](arg, ws)
    const response =  new Response(messageId, payload.data)
    if (payload.broadcast) {
      broadcast(wss, response.json())
    } else {
      ws.send(response.json(), () => {
        console.error("Couldnt send data to ws.")
      })
    }
  })
})

wss.on("error", (e) => {
  console.error("error on wss: ", e)
})

