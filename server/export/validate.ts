import {isResume,contentLength,maxContentChars,validateAll,type Resume} from '../../src/model.js'
import {HttpError} from '../http/security.js'

export function validateExport(value:unknown):asserts value is Resume {
 if(!isResume(value)||contentLength(value)>maxContentChars||validateAll(value).length)throw new HttpError(400,'Complete the required resume details before downloading')
}
