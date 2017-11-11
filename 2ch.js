var countryCodeRegex = /<img.*src="\/flags\/(\w+).*"/
var linkRegex = /^\/(\w+)(\/res\/(\d+).html(#(\d+))?)?/

module = {
  id: '2ch',
  name: '2ch',
  version: 0,
  kitVersion: '0.1',
  lightColor: 'E86B09',
  darkColor: 'FF9500',
  defaultName: 'Аноним',
 
  mappings: {
    mapBoards: function (raw) {
      var result = []
      Object.keys(raw).map(function (name) {
        var boards = raw[name]
        result.push({
          name: name,
          boards: boards.map(function (rawBoard) {
            return {
              id: rawBoard.id,
              name: rawBoard.name,
              isAdult: name == "Взрослым" || rawBoard.id == "b"
            }
          })
        })
      })

      return result
    },

    mapThreads: function (raw) {
      return raw['threads'].map(function (thread) {
        var omittedPosts = thread['posts_count']
        var omittedFiles = thread['files_count']
        var posts = thread['posts'].map(function (post) {
          return module.mappings.mapPost(post)
        })

        var opPost = posts.shift()
        omittedPosts += posts.length
        // omittedFiles += posts.reduce(function (post, count))

        return {
          omittedFiles: omittedFiles,
          omittedPosts: omittedPosts,
          opPost: opPost
        }
      })
    },

    mapCatalogThreads: function (raw) {
      return raw.threads.map(function (rawThread) {
        return {
          omittedFiles: rawThread['files_count'],
          omittedPosts: rawThread['posts_count'],
          opPost: module.mappings.mapPost(rawThread)
        }
      })
    },

    mapPost: function (raw) {
      var post = {
        content: raw['comment'],
        subject: raw['subject'],
        parent: parseInt(raw['parent']),
        name: raw['name'],
        number: parseInt(raw['num']),
        trip: raw['trip'],
        email: raw['email'].replace(/^mailto:/, ''),
        date: raw['timestamp']
      }
      
      if (post.name == 'Anonymous') {
        post.name = 'Аноним'
      }

      var countryCodeMatch = countryCodeRegex.exec(raw['icon'])
      if (countryCodeMatch && countryCodeMatch.length == 2) {
        post.countryCode = countryCodeMatch[1]
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

      if (raw['files']) {
        post.attachments = raw['files'].map(function (attachment) {
          return module.mappings.mapAttachment(attachment)
        })
      }

      return post
    },

    mapAttachment: function (raw) {
      var ext = raw['path'].split('.').pop()
      return {
        url: url('2ch.hk' + raw['path']),
        thumbnailUrl: url('2ch.hk' + raw['thumbnail']),
        width: raw['width'],
        height: raw['height'],
        thumbnailWidth: raw['tn_width'],
        thumbnailHeight: raw['tn_height'],
        type: ext == 'webm' || ext == 'mp4' ? ATTACHMENT_VIDEO : ATTACHMENT_IMAGE,
        size: raw['size'],
        name: raw['fullname'] || raw['name'] || 'unnamed'
      } 

    },

    mapPostingData: function (post) {
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
    loadBoards: function (completion) {
      requestJSON(url('2ch.hk/makaba/mobile.fcgi?task=get_boards'), function (response, error) {
        if (error) {
          completion(null, error)
        } else {
          var result = module.mappings.mapBoards(response)
          completion(result, null)
        }
      })
    },

    loadThreads: function (board, page, completion) {
      var stringPage = page == 0 ? 'index' : page.toString()

      requestJSON(url('2ch.hk/' + board + '/' + stringPage + '.json'), function (response, error) {
        if (error) {
          completion(null, error)
        } else {
          completion(module.mappings.mapThreads(response), null)
        }
      })
    },

    loadThread: function (board, number, completion) {
      var u = url('2ch.hk/makaba/mobile.fcgi?task=get_thread&board='+board+'&thread='+number+'&post=0')
      requestJSON(u, function (response, error) {
        if (error) {
          completion(null, error)
        } else {
          var posts = response.map(function (rawPost, index) {
            if (index != 0)
              rawPost['sticky'] = 0
            return module.mappings.mapPost(rawPost)
          })

          completion(posts, null)
        }
      })
    },

    loadCatalog: function (board, completion) {
      var u = url('2ch.hk/'+board+'/catalog.json')
      requestJSON(u, function (response, error) {
        if (error) {
          completion(null, error)
        } else {
          completion(module.mappings.mapCatalogThreads(response))
        }
      })
    },

    isCaptchaEnabled: function (board, forCreatingThread, completion) {
      var checkForCaptchaInBoard = function () {
        requestJSON(url('2ch.hk/api/captcha/settings/' + board), function (response, error) {
          completion(response['enabled'] || true)
        })
      }

      var checkIfCanPostWithoutCaptcha = function () {
        requestJSON(url('2ch.hk/api/captcha/app/id/' + getPublicKey()), function (response, error) {
          var canPost = response['result'] == 1 && response['type'] == 'app'
          if (canPost) {
            completion(false)
          } else {
            checkForCaptchaInBoard()
          }
        })
      }

      if (forCreatingThread) {
        checkForCaptchaInBoard()
      } else {
        checkIfCanPostWithoutCaptcha()
      }
    },

    getCaptcha: function (completion) {
      requestJSON(url('2ch.hk/api/captcha/2chaptcha/service_id', function (response, error) {
        var id = response['id']
        if (!id) {
          completion(null)
          return
        }

        var imageUrl = url('2ch.hk/api/captcha/2chaptcha/image/'+id)
        
        completion({
          type: IMAGE_CAPTCHA,
          key: id,
          imageUrl: imageUrl
        })
      }))
    },

    sendPost: function (postingData, completion) {
      var data = module.mappings.mapPostingData(postingData)
      if (postingData.captchaResult) {
        module.methods.send(data, postingData, completion)
      } else {
        module.methods.configurePostingWithoutCaptcha(data, function (data) {
          module.methods.send(data, postingData, completion)
        })
      }
    },

    send: function (data, post, completion) {
      var u = url('2ch.hk/makaba/posting.fcgi')
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

    configurePostingWithoutCaptcha: function (data, completion) {
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

  markupMappings: {
    classNames: {
      's': STRIKETHROUGH,
      'unkfunc': QUOTE,
      'spoiler': SPOILER,
    },

    nodeNames: {
      'strong': BOLD,
      'em': ITALIC,
      'sub': LOWER_INDEX,
      'sup': UPPER_INDEX,
    }
  },

  linkCoder: {
    parseURL: function (url) {
      url = url.replace(/^https*:\/\/2ch.hk/, '')
      var match = linkRegex.exec(url)
      if (!match)
        return null

      var boardId = match[1]
      var threadNumber = match[3]
      var postNumber = match[5]
      var result = {}
      
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

    getURL: function (link) {
      var url = "https://2ch.hk/"
      if (link.boardId) {
        url += link.boardId + '/'
      }

      if (link.threadNumber) {
        url += 'res/' + link.threadNumber + '.html'
      }

      if (link.postNumber) {
        url += '#' + link.postNumber
      }

      return url
    }
  }
}

exports.module = module
