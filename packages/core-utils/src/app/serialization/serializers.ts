import { hexStrToBuf, remove0x } from '../misc'
import BN = require('bn.js')
import {utils} from 'ethers'

/**
 * Serializes the provided object to its canonical string representation.
 *
 * @param obj The object to serialize.
 * @returns The serialized object as a string.
 */
export const serializeObject = (obj: {}): string => {
  return JSON.stringify(obj)
}

/**
 * Deserializes the provided string into its object representation.
 * This assumes the string was serialized using the associated serializer.
 *
 * @param obj The string to deserialize.
 * @returns The deserialized object.
 */
export const deserializeObject = (obj: string): {} => {
  return JSON.parse(obj)
}

/**
 * Gets the canonical buffer representation of the provided object.
 *
 * @param obj The object
 * @returns The resulting Buffer
 */
export const objectToBuffer = (obj: {}): Buffer => {
  return Buffer.from(serializeObject(obj))
}

/**
 *
 *
 */
export const abiEncodePacked = (args: [{type: String, value: any}]): Buffer => {
  const result = [];

  for (let {type, value = ''} of args) {
      let hexArgument
      let arraySize

      if ((type.startsWith('int') || type.startsWith('uint')) && typeof value === 'string' && !/^(-)?0x/i.test(value)) {
        value = new BN(value)
      }

      // get the array size
      if (Array.isArray(value)) {
        arraySize = _parseTypeNArray(type);
        if (arraySize && value.length !== arraySize) {
            throw new Error(`${type} is not matching the given array ${JSON.stringify(value)}`);
        } else {
            arraySize = value.length;
        }
      }

      if (Array.isArray(value)) {
        hexArgument = value.map((value_) => {
          return _solidityPack(type, value_, arraySize)
            .toString('hex')
            .replace('0x', '');
        });
        return hexArgument.join('');
      } else {
        hexArgument = _solidityPack(type, value, arraySize);
        return hexArgument.toString('hex').replace('0x', '');
      }
  }

  return Buffer.from(result.join(''), 'hex')
}

const _solidityPack = (type, value, arraySize) => {
  let size
  let number;
  type = _elementaryName(type);

  if (type === 'bytes') {
    if (value.replace(/^0x/i, '').length % 2 !== 0) {
      throw new Error(`Invalid bytes characters ${value.length}`);
    }

    return value;
  } else if (type === 'string') {
    return utils.utf8ToHex(value);
  } else if (type === 'bool') {
    return value ? '01' : '00';
  } else if (type.startsWith('address')) {
    if (arraySize) {
      size = 64;
    } else {
      size = 40;
    }

    if (!utils.isAddress(value)) {
      throw new Error(`${value} is not a valid address, or the checksum is invalid.`);
    }

    return utils.leftPad(value.toLowerCase(), size);
  }

  size = _parseTypeN(type);

  if (type.startsWith('bytes')) {
    if (!size) {
      throw new Error('bytes[] not yet supported in solidity');
    }

    // must be 32 byte slices when in an array
    if (arraySize) {
      size = 32;
    }

    if (size < 1 || size > 32 || size < value.replace(/^0x/i, '').length / 2) {
      throw new Error(`Invalid bytes${size} for ${value}`);
    }

    return rightPad(value, size * 2);
  } else if (type.startsWith('uint')) {
    if (size % 8 || size < 8 || size > 256) {
      throw new Error(`Invalid uint${size} size`);
    }

    number = _parseNumber(value);
    if (number.bitLength() > size) {
      throw new Error(`Supplied uint exceeds width: ${size} vs ${number.bitLength()}`);
    }

    if (number.lt(new BN(0))) {
      throw new Error(`Supplied uint ${number.toString()} is negative`);
    }

    return size ? leftPad(number.toString('hex'), (size / 8) * 2) : number;
  } else if (type.startsWith('int')) {
    if (size % 8 || size < 8 || size > 256) {
      throw new Error(`Invalid int${size} size`);
    }

    number = _parseNumber(value);
    if (number.bitLength() > size) {
      throw new Error(`Supplied int exceeds width: ${size} vs ${number.bitLength()}`);
    }

    if (number.lt(new BN(0))) {
      return number.toTwos(size).toString('hex');
    } else {
      return size ? leftPad(number.toString('hex'), (size / 8) * 2) : number;
    }
  } else {
    // FIXME: support all other types
    throw new Error(`Unsupported or invalid type: ${type}`);
  }
};

/**
 * Should be called to pad string to expected length
 *
 * @method rightPad
 * @param {String} string to be padded
 * @param {Number} chars that result string should have
 * @param {String} sign, by default 0
 * @returns {String} right aligned string
 */
function rightPad(string, chars, sign?) {
    const hasPrefix = /^0x/i.test(string) || typeof string === 'number';
    string = string.toString(16).replace(/^0x/i,'');

    const padding = (chars - string.length + 1 >= 0) ? chars - string.length + 1 : 0;

    return (hasPrefix ? '0x' : '') + string + (new Array(padding).join(sign ? sign : '0'));
};

/**
 * Should be called to pad string to expected length
 *
 * @method leftPad
 * @param {String} string to be padded
 * @param {Number} chars that result string should have
 * @param {String} sign, by default 0
 * @returns {String} right aligned string
 */
function leftPad(string, chars, sign?) {
    const hasPrefix = /^0x/i.test(string) || typeof string === 'number';
    string = string.toString(16).replace(/^0x/i,'');

    const padding = (chars - string.length + 1 >= 0) ? chars - string.length + 1 : 0;

    return (hasPrefix ? '0x' : '') + new Array(padding).join(sign ? sign : "0") + string;
};

function _parseNumber(arg) {
    const type = typeof arg;
    if (type === 'string') {
        if (isHexStrict(arg)) {
            return new BN(arg.replace(/0x/i,''), 16);
        } else {
            return new BN(arg, 10);
        }
    } else if (type === 'number') {
        return new BN(arg);
    } else if (isBigNumber(arg)) {
        return new BN(arg.toString(10));
    } else if (BN.isBN(arg)) {
        return arg;
    } else {
        throw new Error(arg +' is not a number');
    }
};

/**
 * Returns true if object is BigNumber, otherwise false
 *
 * @method isBigNumber
 * @param {Object} object
 * @return {Boolean}
 */
function isBigNumber(object) {
    return object && object.constructor && object.constructor.name === 'BigNumber';
};

/**
 * Check if string is HEX, requires a 0x in front
 *
 * @method isHexStrict
 * @param {String} hex to be checked
 * @returns {Boolean}
 */
function isHexStrict(hex: string | number): boolean {
    return ((typeof hex === 'string' || typeof hex === 'number')
            && /^(-)?0x[0-9a-f]*$/i.test(hex as string))
};
