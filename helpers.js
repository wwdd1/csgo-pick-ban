const randomInt = (min, max) => {
  return Math.floor(Math.random() * max) + min
}

const _pickRandomMaster = playerList => {
  const firstMasterIndex = randomInt(0, playerList.length)
  return playerList[firstMasterIndex]
}

const _pickNearbyMaster = (playerList, master) => {
  const playerListSortedBySkillsDesc = playerList.sort((a,b) => a.skill < b.skill ? 1 : -1)
  const masterOneIndex = playerListSortedBySkillsDesc.findIndex(p => master.name === p.name)
  const pickIndexAfter = !!randomInt(0, 2)
  if (pickIndexAfter) {
    if (masterOneIndex + 1 !== playerListSortedBySkillsDesc.length) {
      return playerListSortedBySkillsDesc[masterOneIndex + 1]
    } else {
      return playerListSortedBySkillsDesc[masterOneIndex - 1]
    }
  } else {
    if (masterOneIndex === 0) {
      return playerListSortedBySkillsDesc[masterOneIndex + 1]
    } else {
      return playerListSortedBySkillsDesc[masterOneIndex - 1]
    }
  }
}

const pickMasters = playerList => {
  const activePlayers = playerList.filter(p => p.active)
  let masterOne = _pickRandomMaster(activePlayers)
  let masterTwo = _pickNearbyMaster(activePlayers, masterOne)
  return [masterOne, masterTwo]
}

const preparePickablePlayers = (session, playerList) => {
  const pickPhase = session.getPickPhase()
  if (!pickPhase) {
    return []
  }
  console.log({ "session.masters": session.masters })
  const masters = session.masters.map(m => m.player.name)
  const pickedPlayers = Object.values(session.picks)
    .flat(1)
    .map(p => p.name)
    .concat(masters)
  let pickablePlayers = playerList
    .filter(p => {
      return p.active && !pickedPlayers.includes(p.name)
    })
    .sort((a,b) => (a.skill > b.skill ? -1 : 1))
  return pickablePlayers
}

const evaluatePickPhase = (session) => {
  let pickPhase = session.getPickPhase()
  if (!pickPhase) {
    return session.pickPool
  }
  const totalPicked = session.getTotalPickedPlayersCount()
  if (session.pickPhaseCount === totalPicked) {
    pickPhase = session.nextPickPhase()
    if (pickPhase === null) {
      return []
    }
    session.pickPhaseCount += pickPhase.count
  }
  return session.pickPool.map((p, index) => ({
    ...p,
    pickable: index < session.pickPhaseCount - totalPicked
  }))
}

module.exports = {
  randomInt,
  pickMasters,
  preparePickablePlayers,
  evaluatePickPhase
}
