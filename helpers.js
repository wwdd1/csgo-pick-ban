const randomInt = (min, max) => {
  return Math.floor(Math.random() * max) + min
}

const _pickRandomMaster = playerList => {
  // TODO
  const firstMasterIndex = randomInt(0, playerList.length)
  return playerList[firstMasterIndex]
}

const pickMasters = playerList => {
  let masterOne = _pickRandomMaster(playerList)
  let masterTwo = null
  const playerListSortedBySkillsDesc = playerList.sort((a,b) => a.skill > b.skill ? 1 : -1)
  const masterOneIndex = playerListSortedBySkillsDesc.findIndex(a => a.name === masterOne.name)
  const pickIndexAfter = !!randomInt(0, 1)
  if (pickIndexAfter && masterOneIndex + 1 < playerListSortedBySkillsDesc.length) {
    masterTwo = playerListSortedBySkillsDesc[masterOneIndex + 1]
  } else {
    masterTwo = playerListSortedBySkillsDesc[masterOneIndex - 1]
  }
  return [masterOne, masterTwo]
}

const preparePickablePlayers = (session, playerList) => {
  const pickPhase = session.getPickPhase()
  if (!pickPhase) {
    return []
  }
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
