var countryCodeRegex = /<img.*src="\/flags\/(\w+).*"/
var linkRegex = /^\/(\w+)(\/thread\/(\d+)(#p(\d+))?)?/
var postLinkRegex = /^\#p(\d+)?/

module = {
  id: '4chan',
  name: '4chan',
  version: 0,
  kitVersion: '0.1',
  lightColor: '4AA11B',
  darkColor: '77C344',
  defaultName: 'Anonymous',
 
  mappings: {
    mapBoards: function (raw) {
      var result = []
      Object.keys(raw).map(function (rawBoard) {
        result.push({
          name: '',
          boards: {
            id: rawBoard.board,
            name: rawBoard.title,
            isAdult: rawBoard.ws_board == 0
          }
        })
      })

      return result
    },

    mapThreads: function (raw) { // ++
      return raw['threads'].map(function (thread) {
        var omittedPosts = thread['replies']
        var omittedFiles = thread['images']
        var posts = thread['posts'].map(function (post) {
          return module.mappings.mapPost(post)
        })

        var opPost = posts.shift()

        return {
          omittedFiles: omittedFiles,
          omittedPosts: omittedPosts,
          opPost: opPost
        }
      })
    },

    mapCatalogThreads: function (raw) { // ++
      return raw.map(function (pages) {
        return pages.map(function (threads) {
         return threads.map(function (rawThread) {
            return {
              omittedFiles: rawThread['images'],
              omittedPosts: rawThread['replies'],
              opPost: module.mappings.mapPost(rawThread)
            }
          })
        })
      })
    },

    mapPost: function (raw) { // ++
      var post = {
        content: raw['com'],
        subject: raw['sub'],
        parent: parseInt(raw['resto']),
        name: raw['name'],
        number: parseInt(raw['no']),
        trip: raw['trip'],
        date: raw['time']
      }
      
      if (raw['country']) {
        post.countryCode = raw['country']
      }

      if (raw['troll_country']) {
        post.countryCode = raw['troll_country']
      }

      var markers = {
        'op': MARKER_OP,
        'banned': MARKER_BANNED,
        'sticky': MARKER_PINNED,
        'closed': MARKER_CLOSED,
      }

      post.markers = 0
      for (var marker in markers) {
        var value = markers[marker]
        if (markers.hasOwnProperty(marker) && raw[marker]) {
          post.markers |= value
        }
      }

      if (raw['filename']) {
        post.attachments = module.mappings.mapAttachment(raw)
      }

      return post
    },

    mapAttachment: function (raw) { // ++
      return {
        url: url('i.4cdn.org/'+ rawPost['boardId'] + raw['tim'] + raw['ext']),
        thumbnailUrl: url('i.4cdn.org'+ rawPost['boardId'] + raw['tim'] + 's' + raw['ext']),
        width: raw['w'],
        height: raw['h'],
        thumbnailWidth: raw['tn_w'],
        thumbnailHeight: raw['tn_h'],
        type: raw['ext'] == '.webm' || raw['ext'] == '.mp4' ? ATTACHMENT_VIDEO : ATTACHMENT_IMAGE,
        size: raw['fsize'],
        name: raw['filename'] || raw['tim'] || 'unnamed'
      } 

    },

    mapPostingData: function (post) { // --
      var result = {
        json: '1',
        task: 'post',
        board: post.boardId,
        thread: ''+post.threadNumber,
        comment: post.text,
        op_mark: post.isOp ? '1' : '0',
        subject: post.subject,
        email: post.email,
        name: post.name
      }

      if (post.captchaResult) {
        result['captcha_type'] = '2chaptcha'
        result['2chaptcha_id'] = post.captchaResult.key
        result['2chaptcha_value'] = post.captchaResult.input
      }

      return result
    }
  },


  methods: {
    loadBoards: function (completion) { // ++
      requestJSON(url('a.4cdn.org/boards.json'), function (response, error) {
        if (error) {
          completion(null, error)
        } else {
          var result = module.mappings.mapBoards(response)
          completion(result, null)
        }
      })
    },

    loadThreads: function (board, page, completion) { // ++
      requestJSON(url('a.4cdn.org/' + board + '/' + (page + 1) + '.json'), function (response, error) {
        if (error) {
          completion(null, error)
        } else {
          completion(module.mappings.mapThreads(response), null)
        }
      })
    },

    loadThread: function (board, number, completion) { // ++
      var u = url('a.4cdn.org/' + board + '/thread/' + number + '.json')
      requestJSON(u, function (response, error) {
        if (error) {
          completion(null, error)
        } else {
          var posts = response.map(function (rawPost, index) {
            rawPost['boardId'] = board
            return module.mappings.mapPost(rawPost)
          })

          completion(posts, null)
        }
      })
    },

    loadCatalog: function (board, completion) { // ++
      var u = url('a.4cdn.org/' + board + '/catalog.json')
      requestJSON(u, function (response, error) {
        if (error) {
          completion(null, error)
        } else {
          completion(module.mappings.mapCatalogThreads(response))
        }
      })
    },

    isCaptchaEnabled: function (board, forCreatingThread, completion) { // ++
      completion(true)
    },

    getCaptcha: function (completion) { // ++
      completion(false)
    },

    sendPost: function (postingData, completion) { // --
      var data = module.mappings.mapPostingData(postingData)
      if (postingData.captchaResult) {
        module.methods.send(data, postingData, completion)
      } else {
        module.methods.configurePostingWithoutCaptcha(data, function (data) {
          module.methods.send(data, postingData, completion)
        })
      }
    },

    send: function (data, post, completion) { // --
      var u = url('sys.4chan.org/' + post.boardId + '/post')
      for (var i = 0; i < post.attachments.length; i++) {
        var a = post.attachments[i]
        data['image'+i] = {
          fileName: a.name,
          mimeType: a.mimeType,
          data: a.data
        }
      }

      upload(data, u, function (response, error) {
        if (error = (error || response['Reason'])) {
          completion(null, error)
        } else {
          var postNumber = response['Num'] || response['Target']
          completion(postNumber, null)
        }
      })
    },

    configurePostingWithoutCaptcha: function (data, completion) { // --
      requestJSON(url('2ch.hk/api/captcha/app/id/' + getPublicKey()), function (response, error) {
        var canPost = response['result'] == 1 && response['type'] == 'app'
        var id = response['id']
        if (canPost) {
          data['captcha_type'] = 'app'
          data['app_response_id'] = id
          data['app_response'] = encryptPostingKey(id)
        }

        completion(data)
      })
    }
  },


  linkCoder: {
    parseURL: function (url) { // ++
      url = url.replace(/^https*:\/\/boards.4chan.org/, '')

      var onlyPostLink = postLinkRegex.exec(url)
      var link = linkRegex.exec(url)

      var result = {}

      if (onlyPostLink) {
        result.boardId = ''
        result.threadNumber = parseInt('0')
        result.postNumber = parseInt(onlyPostLink[1])
        result.isSameThread = true

        return result
      }

      if (!link)
        return null

      var boardId = link[1]
      var threadNumber = link[3]
      var postNumber = link[5]

      if (boardId) {
        result.boardId = boardId
      }

      if (threadNumber) {
        result.threadNumber = parseInt(threadNumber)
      }

      if (postNumber) {
        result.postNumber = parseInt(postNumber)
      }

      return result
    },

    getURL: function (link) { // ++
      var url = "https://boards.4chan.org/"
      if (link.boardId) {
        url += link.boardId + '/'
      }

      if (link.threadNumber) {
        url += 'thread/' + link.threadNumber + '/'
      }

      if (link.postNumber) {
        url += '#' + link.postNumber
      }

      return url
    }
  }
}

exports.module = module