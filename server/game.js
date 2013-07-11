////////// Server only logic //////////

get_All_Words = function(board){
  if (Meteor.isServer) {
    foundWords = [];
    for(var index = 0; index < board.length; ++index){
      dfs([index], ADJACENCIES[index], foundWords, board);
    }
    //return _.intersection(foundWords, DICTIONARY);
    return _(foundWords).filter(function(word){return binarySearch(DICTIONARY, word);});
  }
};

dfs = function(visited, neighbors, foundWords, board){
  if (visited.length > 2){
    foundWords.push(_(visited).reduce(function(word, index){return word + board[index]}, "").toLowerCase());
  }
  for(var index = 0; index < neighbors.length; index++){
    var neighbor = neighbors[index];
    var neighborsNeighbors = _(ADJACENCIES[neighbor]).without(updatedVisited);
    if (_(neighborsNeighbors).some() && visited.length < 5){
      var updatedVisited = visited.slice()
      updatedVisited.push(neighbor)
      dfs(updatedVisited, neighborsNeighbors, foundWords, board)
    }
  }
};

binarySearch = function(arr, find) {
  var low = 0, high = arr.length - 1,
      i, comparison;
  while (low <= high) {
    i = Math.floor((low + high) / 2);
    if (arr[i] < find) { low = i + 1; continue; };
    if (arr[i] > find) { high = i - 1; continue; };
    return i;
  }
  return null;
};

Meteor.methods({
  start_new_game: function () {
    // create a new game w/ fresh board
    var board = new_board();
    var game_id = Games.insert({board: board,
                                clock: 25});

    // move everyone who is ready in the lobby to the game
    Players.update({game_id: null, idle: false, name: {$ne: ''}},
                   {$set: {game_id: game_id}},
                   {multi: true});
    // Save a record of who is in the game, so when they leave we can
    // still show them.
    var p = Players.find({game_id: game_id},
                         {fields: {_id: true, name: true}}).fetch();
    Games.update({_id: game_id}, {$set: {players: p}});


    // wind down the game clock
    var clock = 25;
    var interval = Meteor.setInterval(function () {
      clock -= 1;
      Games.update(game_id, {$set: {clock: clock}});

      // end of game
      if (clock === 0) {
        // stop the clock
        Meteor.clearInterval(interval);
        // declare zero or more winners
        var scores = {};
        Words.find({game_id: game_id}).forEach(function (word) {
          if (!scores[word.player_id])
            scores[word.player_id] = 0;
          scores[word.player_id] += word.score;
        });
        var high_score = _.max(scores);
        var winners = [];
        _.each(scores, function (score, player_id) {
          if (score === high_score)
            winners.push(player_id);
        });
        var validWords = get_All_Words(board)
        Games.update(game_id, {$set: {winners: winners}});
        Games.update(game_id, {$set: {validWords: validWords}})
      }
    }, 1000);

    return game_id;
  },


  keepalive: function (player_id) {
    check(player_id, String);
    Players.update({_id: player_id},
                  {$set: {last_keepalive: (new Date()).getTime(),
                          idle: false}});
  }
});

Meteor.setInterval(function () {
  var now = (new Date()).getTime();
  var idle_threshold = now - 70*1000; // 70 sec
  var remove_threshold = now - 60*60*1000; // 1hr

  Players.update({last_keepalive: {$lt: idle_threshold}},
                 {$set: {idle: true}});

  // XXX need to deal with people coming back!
  // Players.remove({$lt: {last_keepalive: remove_threshold}});

}, 30*1000);