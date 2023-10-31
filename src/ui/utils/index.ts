import { IAtomicalItem } from '@/background/service/interfaces/api';
import { detectAddressTypeToScripthash } from '@/background/service/utils';
import * as bitcoin from 'bitcoinjs-lib';
import BigNumber from 'bignumber.js';
import { toUnicode } from 'punycode';
import { useLocation } from 'react-router-dom';
import {
  AddressType,
  CalcFeeOptions,
  LocalWallet,
  getAddressType,
  internalWallet,
  utxoToInput
} from './local_wallet';
import { GasCalculateInterface, NetworkType } from '@/shared/types';
import { DUST_AMOUNT } from '@/shared/constant';
import { toPsbtNetwork } from '@/background/utils/tx-utils';

export * from './hooks';
export * from './WalletContext';
const UI_TYPE = {
  Tab: 'index',
  Pop: 'popup',
  Notification: 'notification'
};

type UiTypeCheck = {
  isTab: boolean;
  isNotification: boolean;
  isPop: boolean;
};

export const getUiType = (): UiTypeCheck => {
  const { pathname } = window.location;
  return Object.entries(UI_TYPE).reduce((m, [key, value]) => {
    m[`is${key}`] = pathname === `/${value}.html`;

    return m;
  }, {} as UiTypeCheck);
};

export const hex2Text = (hex: string) => {
  try {
    return hex.startsWith('0x') ? decodeURIComponent(hex.replace(/^0x/, '').replace(/[0-9a-f]{2}/g, '%$&')) : hex;
  } catch {
    return hex;
  }
};

export const getUITypeName = (): string => {
  // need to refact
  const UIType = getUiType();

  if (UIType.isPop) return 'popup';
  if (UIType.isNotification) return 'notification';
  if (UIType.isTab) return 'tab';

  return '';
};

/**
 *
 * @param origin (exchange.pancakeswap.finance)
 * @returns (pancakeswap)
 */
export const getOriginName = (origin: string) => {
  const matches = origin.replace(/https?:\/\//, '').match(/^([^.]+\.)?(\S+)\./);

  return matches ? matches[2] || origin : origin;
};

export const hashCode = (str: string) => {
  if (!str) return 0;
  let hash = 0,
    i,
    chr,
    len;
  if (str.length === 0) return hash;
  for (i = 0, len = str.length; i < len; i++) {
    chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};

export const ellipsisOverflowedText = (str: string, length = 5, removeLastComma = false) => {
  if (str.length <= length) return str;
  let cut = str.substring(0, length);
  if (removeLastComma) {
    if (cut.endsWith(',')) {
      cut = cut.substring(0, length - 1);
    }
  }
  return `${cut}...`;
};

export const satoshisToBTC = (amount: number) => {
  return amount / 100000000;
};

export const btcTosatoshis = (amount: number) => {
  return Math.floor(amount * 100000000);
};

export function shortAddress(address?: string, len = 5) {
  if (!address) return '';
  if (address.length <= len * 2) return address;
  return address.slice(0, len) + '...' + address.slice(address.length - len);
}

export function shortDesc(desc?: string, len = 50) {
  if (!desc) return '';
  if (desc.length <= len) return desc;
  return desc.slice(0, len) + '...';
}

export async function sleep(timeSec: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(null);
    }, timeSec * 1000);
  });
}

export function isValidAddress(address: string) {
  if (!address) return false;
  return true;
}

export const copyToClipboard = (textToCopy: string | number) => {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(textToCopy.toString());
  } else {
    const textArea = document.createElement('textarea');
    textArea.value = textToCopy.toString();
    textArea.style.position = 'absolute';
    textArea.style.opacity = '0';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    return new Promise<void>((res, rej) => {
      document.execCommand('copy') ? res() : rej();
      textArea.remove();
    });
  }
};

export function formatDate(date: Date, fmt = 'yyyy-MM-dd hh:mm:ss') {
  const o = {
    'M+': date.getMonth() + 1,
    'd+': date.getDate(),
    'h+': date.getHours(),
    'm+': date.getMinutes(),
    's+': date.getSeconds(),
    'q+': Math.floor((date.getMonth() + 3) / 3),
    S: date.getMilliseconds()
  };
  if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, `${date.getFullYear()}`.substr(4 - RegExp.$1.length));
  for (const k in o)
    if (new RegExp(`(${k})`).test(fmt))
      fmt = fmt.replace(RegExp.$1, RegExp.$1.length === 1 ? o[k] : `00${o[k]}`.substr(`${o[k]}`.length));
  return fmt;
}

export function satoshisToAmount(val: number) {
  const num = new BigNumber(val);
  return num.dividedBy(100000000).toFixed(8);
}

export function amountToSatoshis(val: any) {
  const num = new BigNumber(val);
  return num.multipliedBy(100000000).toNumber();
}

export function useLocationState<T>() {
  const { state } = useLocation();
  return state as T;
}

export const calculateFundsRequired = (
  additionalInputValue: number,
  atomicalSats: number,
  satsByte: number,
  mintDataLength = 0,
  baseTxByteLength = 300
) => {
  // The default base includes assumes 1 input and 1 output with room to spare
  const estimatedTxSizeBytes = baseTxByteLength + mintDataLength;
  const expectedFee = estimatedTxSizeBytes * satsByte;
  let expectedSatoshisDeposit = expectedFee + atomicalSats - additionalInputValue;
  if (expectedSatoshisDeposit > 0 && expectedSatoshisDeposit < 546) {
    expectedSatoshisDeposit = 546;
  }
  return {
    expectedSatoshisDeposit,
    expectedFee
  };
};

export const calculateFTFundsRequired = (
  numberOfInputs: number,
  numberOfOutputs: number,
  satsByte: number,
  mintDataLength = 0,
  baseTxByteLength = 300
) => {
  // The default base includes assumes 1 input and 1 output with room to spare
  const estimatedTxSizeBytes = baseTxByteLength + mintDataLength;
  const baseInputSize = 36 + 4 + 64;
  const baseOutputSize = 8 + 20 + 4;

  let expectedSatoshisDeposit =
    (estimatedTxSizeBytes + numberOfInputs * baseInputSize + numberOfOutputs * baseOutputSize) * satsByte;
  if (expectedSatoshisDeposit > 0 && expectedSatoshisDeposit < 546) {
    expectedSatoshisDeposit = 546;
  }
  return {
    expectedSatoshisDeposit
  };
};

export async function calculateGasV2(
  fromAddress: string,
  transferOptions: GasCalculateInterface,
  satsbyte: number,
  networkType: NetworkType
): Promise<number> {
  const network = toPsbtNetwork(networkType);
  const addressType = getAddressType(fromAddress);
  const wallet = new LocalWallet(internalWallet.WIF, networkType ? networkType : NetworkType.MAINNET, addressType);
  const psbt = new bitcoin.Psbt({ network });
  const psbt2 = new bitcoin.Psbt({ network });
  const { output: scriptOutput } = detectAddressTypeToScripthash(wallet.address, networkType);
  let tokenInputsLength = 0;
  let tokenOutputsLength = 0;
  for (const utxo of transferOptions.selectedUtxos) {
    // Add the atomical input, the value from the input counts towards the total satoshi amount required
    psbt.addInput(utxoToInput({ utxo, script: scriptOutput, pubkey: wallet.pubkey, addressType })!.data);
    psbt2.addInput(utxoToInput({ utxo, script: scriptOutput, pubkey: wallet.pubkey, addressType })!.data);
    tokenInputsLength += 1;
  }

  for (const output of transferOptions.outputs) {
    // Add the atomical input, the value from the input counts towards the total satoshi amount required
    if (output.value !== undefined) {
      psbt.addOutput({
        value: output.value,
        address: fromAddress
      });
      psbt2.addOutput({
        value: output.value,
        address: fromAddress
      });
      tokenOutputsLength += 1;
    }
  }

  if (tokenInputsLength > 0 && tokenOutputsLength > 0) {
    let fee = await calculateNetworkFeeV2(psbt, wallet, satsbyte, addressType);
    if (fee <= DUST_AMOUNT) {
      return DUST_AMOUNT;
    } else {
      let addedValue = 0;
      // psbt.data.inputs.forEach((v, i) => {
      //   if (v.finalScriptSig || v.finalScriptWitness) {
      //     psbt.clearFinalizedInput(i);
      //   }
      // });
      if (transferOptions.regularsUTXOs && transferOptions.regularsUTXOs!.length > 0) {
        const _regulars = transferOptions.regularsUTXOs;
        for (let i = 0; i <= transferOptions.regularsUTXOs.length; i += 1) {
          const utxo = _regulars[i];
          if (addedValue >= fee) {
            break;
          } else {
            addedValue += utxo.value;
            const { output } = detectAddressTypeToScripthash(wallet.address, networkType);
            psbt2.addInput(utxoToInput({ utxo, addressType, pubkey: wallet.pubkey, script: output })!.data);
            // psbt.setInputSequence(utxo.vout, 0xfffffffd);
          }
        }
        if (addedValue - fee >= 546) {
          psbt2.addOutput({
            value: addedValue - fee,
            address: fromAddress
          });
        }
        fee = await calculateNetworkFeeV2(psbt2, wallet, satsbyte, addressType);
      }
      return fee;
    }
  }
  return 0;
}

export async function calculateNetworkFeeV2(
  psbt: bitcoin.Psbt,
  wallet: LocalWallet,
  feeRate: number,
  addressType: AddressType
): Promise<number> {
  if (addressType === AddressType.P2PKH) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    psbt.__CACHE.__UNSAFE_SIGN_NONSEGWIT = true;
  }

  const _psbt = wallet.signPsbt(psbt);
  let txSize = _psbt.extractTransaction(true).toBuffer().length;
  _psbt.data.inputs.forEach((v) => {
    if (v.finalScriptWitness) {
      txSize -= v.finalScriptWitness.length * 0.75;
    }
  });
  return Math.ceil(txSize * feeRate);
}

export function flattenObject(ob: any = {}) {
  const toReturn: { [key: string]: any } = {};

  for (const i in ob) {
    if (Object.prototype.hasOwnProperty.call(ob, i)) {
      if (typeof ob[i] == 'object' && ob[i] !== null) {
        const flatObject = flattenObject(ob[i]);
        for (const x in flatObject) {
          if (Object.prototype.hasOwnProperty.call(flatObject, x)) {
            toReturn[i + '.' + x] = flatObject[x];
          }
        }
      } else {
        toReturn[i] = ob[i];
      }
    }
  }
  return toReturn;
}

export function findValueInDeepObject(obj: any, key: string): any | undefined {
  const flattened = flattenObject(obj);
  const found = Object.keys(flattened).find((_key) => _key.includes(key));
  if (found) {
    return flattened[found];
  } else {
    return undefined;
  }
}

export function tryDecodePunycode(name: string) {
  if (name.toLowerCase().startsWith('xn--')) {
    try {
      return toUnicode(name);
    } catch (_) {
      /* empty */
    }
  }
  return name;
}

export function returnImageType(item: IAtomicalItem): { type: string; content: string; tag: string; buffer?: Buffer } {
  let ct, content, type, tag, buffer;
  const text =
    item.$request_realm ||
    item.$request_container ||
    item.$request_subrealm ||
    item.$realm ||
    item.mint_data?.fields?.args?.request_realm ||
    item.mint_data?.fields?.args?.request_subrealm ||
    item.mint_data?.fields?.args?.request_container;
  if (text) {
    type = 'realm';
    tag = 'Realm';
    const content = tryDecodePunycode(text);
    return { type, content, tag, buffer };
  } else {
    if (findValueInDeepObject(item.mint_data?.fields, '$d') && findValueInDeepObject(item.mint_data?.fields, '$ct')) {
      type = 'nft';
      ct = findValueInDeepObject(item.mint_data?.fields, '$ct');
      if (ct) {
        if (ct.endsWith('webp')) {
          ct = 'image/webp';
        } else if (ct.endsWith('svg')) {
          ct = 'image/svg+xml';
        } else if (ct.endsWith('png')) {
          ct = 'image/png';
        } else if (ct.endsWith('jpg') || ct.endsWith('jpeg')) {
          ct = 'image/jpeg';
        } else if (ct.endsWith('gif')) {
          ct = 'image/gif';
        }
        const data = findValueInDeepObject(item.mint_data?.fields, '$d');
        const b64String = Buffer.from(data, 'hex').toString('base64');
        content = `data:${ct};base64,${b64String}`;
        tag = ct;
        buffer = data ? Buffer.from(data, 'hex') : undefined;
        return { type, content, tag, buffer };
      }
    } else {
      return { type: 'unknown', content: '', tag: 'unknown' };
    }
  }
  return { type, content, tag, buffer };
}

export function calcFee({ inputs, outputs, feeRate, addressType, network, autoFinalized }: CalcFeeOptions) {
  network ??= NetworkType.MAINNET;
  const wallet = new LocalWallet(internalWallet.WIF, network, addressType);
  const psbt = new bitcoin.Psbt({ network: toPsbtNetwork(network) });
  if (addressType === AddressType.P2PKH) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    psbt.__CACHE.__UNSAFE_SIGN_NONSEGWIT = true;
  }
  const { output } = detectAddressTypeToScripthash(wallet.address, network);
  inputs.forEach((v) => {
    psbt.addInput(utxoToInput({ utxo: v, addressType, pubkey: wallet.pubkey, script: output })!.data);
  });
  outputs.forEach((v) => {
    psbt.addOutput(v);
  });
  const newPsbt = wallet.signPsbt(psbt, {
    autoFinalized: autoFinalized == undefined ? true : autoFinalized
  });
  let txSize = newPsbt.extractTransaction(true).toBuffer().length;
  newPsbt.data.inputs.forEach((v) => {
    if (v.finalScriptWitness) {
      txSize -= v.finalScriptWitness.length * 0.75;
    }
  });
  return Math.ceil(txSize * feeRate);
}
