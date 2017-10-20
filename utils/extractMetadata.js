BOLD = ITALIC = STRIKETHROUGH = SPOILER = QUOTE = UNDERLINE = LOWER_INDEX = UPPER_INDEX = MARKER_OP = MARKER_BANNED = MARKER_PINNED = MARKER_CLOSED = ATTACHMENT_IMAGE = ATTACHMENT_VIDEO = IMAGE_CAPTCHA = RECAPTCHA = 0

if (process.argv.length < 3) {
    console.error('Path is required')
}

resolve = require('path').resolve
let path = resolve(process.argv[2])



let properties = ['id', 'name', 'version', 'kitVersion', 'lightColor', 'darkColor']
let object = require(path).module
let result = {}

for (property of properties) {
    if (object[property]) {
        result[property] = object[property]
    }
}


console.log(JSON.stringify(result))
process.exit(0)