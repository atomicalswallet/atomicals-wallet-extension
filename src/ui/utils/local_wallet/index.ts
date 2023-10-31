
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { isTaprootInput } from 'bitcoinjs-lib/src/psbt/bip371';
import ECPairFactory,{ ECPairInterface } from 'ecpair';
import { AddressType, NetworkType } from '@/shared/types';
import { UTXO } from '@/background/service/interfaces/utxo';
import { publicKeyToAddress, toPsbtNetwork } from '@/background/utils/tx-utils';
bitcoin.initEccLib(ecc);


const ECPair = ECPairFactory(ecc);

export function utxoToInput({ utxo, script, addressType, pubkey }: {
  utxo: UTXO;
  script?: string | Buffer;
  addressType: AddressType;
  pubkey: string;
}): TxInput | undefined {
  const scriptPk = Buffer.from((script || utxo.script!) as any, 'hex');
  if (addressType === AddressType.P2TR) {
    const data = {
      hash: utxo.txid,
      index: utxo.index,
      witnessUtxo: {
        value: utxo.value,
        script: scriptPk,
      },
      tapInternalKey: toXOnly(Buffer.from(pubkey as any, 'hex')),
    };
    return {
      data,
      utxo,
    };
  } else if (addressType === AddressType.P2WPKH) {
    const data = {
      hash: utxo.txid,
      index: utxo.index,
      witnessUtxo: {
        value: utxo.value,
        script: scriptPk,
      },
    };
    return {
      data,
      utxo,
    };
  } else if (addressType === AddressType.P2PKH) {
    const data = {
      hash: utxo.txid,
      index: utxo.index,
      witnessUtxo: {
        value: utxo.value,
        script: scriptPk,
      },
    };
    return {
      data,
      utxo,
    };
  } else if (addressType === AddressType.P2SH_P2WPKH) {
    const redeemData = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(pubkey, 'hex') });
    const data = {
      hash: utxo.txid,
      index: utxo.index,
      witnessUtxo: {
        value: utxo.value,
        script: scriptPk,
      },
      redeemScript: redeemData.output,
    };
    return {
      data,
      utxo,
    };
  } else {
    throw new Error('unsupported address type');
  }
}


export function getAddressType(address: string): AddressType {
  if (address.startsWith('bc1q')) {
    return AddressType.P2WPKH;
  } else if (address.startsWith('bc1p')) {
    return AddressType.P2TR;
  } else if (address.startsWith('1')) {
    return AddressType.P2PKH;
  } else if (address.startsWith('3')) {
    return AddressType.P2SH_P2WPKH;
  } else if (address.startsWith('tb1q')) {
    return AddressType.P2WPKH;
  } else if (address.startsWith('m') || address.startsWith('n')) {
    return AddressType.P2PKH;
  } else if (address.startsWith('2')) {
    return AddressType.P2SH_P2WPKH;
  } else if (address.startsWith('tb1p')) {
    return AddressType.P2TR;
  } else {
    return AddressType.UNKNOWN;
  }
}

export const validator = (
  pubkey: Buffer,
  msghash: Buffer,
  signature: Buffer,
): boolean => ECPair.fromPublicKey(pubkey).verify(msghash, signature);

export const toXOnly = (pubKey: Buffer) =>
  pubKey.length === 32 ? pubKey : pubKey.slice(1, 33);

function tapTweakHash(pubKey: Buffer, h: Buffer | undefined): Buffer {
  return bitcoin.crypto.taggedHash(
    'TapTweak',
    Buffer.concat(h ? [pubKey, h] : [pubKey]),
  );
}

export function tweakSigner(signer: bitcoin.Signer, opts: any = {}): bitcoin.Signer {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  let privateKey: Uint8Array | undefined = signer.privateKey!;
  if (!privateKey) {
    throw new Error('Private key is required for tweaking signer!');
  }
  if (signer.publicKey[0] === 3) {
    privateKey = ecc.privateNegate(privateKey);
  }

  const tweakedPrivateKey = ecc.privateAdd(
    privateKey,
    tapTweakHash(toXOnly(signer.publicKey), opts.tweakHash),
  );
  if (!tweakedPrivateKey) {
    throw new Error('Invalid tweaked private key!');
  }

  return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network: opts.network,
  });
}

// export enum NetworkType {
//   MAINNET,
//   TESTNET,
// }



//  function publicKeyToPayment(
//   publicKey: string,
//   type: AddressType,
//   networkType: NetworkType,
// ) {
//   const network = toPsbtNetwork(networkType);
//   if (!publicKey) return null;
//   const pubkey = Buffer.from(publicKey, 'hex');
//   if (type === AddressType.P2PKH) {
//     return bitcoin.payments.p2pkh({
//       pubkey,
//       network,
//     });
//   } else if (type === AddressType.P2WPKH || type === AddressType.M44_P2WPKH) {
//     return bitcoin.payments.p2wpkh({
//       pubkey,
//       network,
//     });
//   } else if (type === AddressType.P2TR || type === AddressType.M44_P2TR) {
//     return bitcoin.payments.p2tr({
//       internalPubkey: pubkey.slice(1, 33),
//       network,
//     });
//   } else if (type === AddressType.P2SH_P2WPKH) {
//     const data = bitcoin.payments.p2wpkh({
//       pubkey,
//       network,
//     });
//     return bitcoin.payments.p2sh({
//       pubkey,
//       network,
//       redeem: data,
//     });
//   }
// }

// function publicKeyToAddress(
//   publicKey: string,
//   type: AddressType,
//   networkType: NetworkType,
// ) {
//   const payment = publicKeyToPayment(publicKey, type, networkType);
//   if (payment && payment.address) {
//     return payment.address;
//   } else {
//     return '';
//   }
// }

// export function publicKeyToScriptPk(
//   publicKey: string,
//   type: AddressType,
//   networkType: NetworkType,
// ) {
//   const payment = publicKeyToPayment(publicKey, type, networkType);
//   return payment!.output!.toString('hex');
// }

export interface ToSignInput {
  index: number;
  publicKey: string;
  sighashTypes?: number[];
}

export interface SignOptions {
  inputs?: ToSignInput[];
  autoFinalized?: boolean;
}

export function randomWIF(networkType = NetworkType.TESTNET) {
  const network = toPsbtNetwork(networkType);
  const keyPair = ECPair.makeRandom({ network });
  return keyPair.toWIF();
}


export interface CalcFeeOptions {
  inputs: UTXO[];
  outputs: { address: string, value: number }[];
  addressType: AddressType;
  feeRate: number;
  network?: NetworkType;
  autoFinalized?: boolean;
}

export interface TxInput {
  data: {
    hash: string;
    index: number;
    witnessUtxo: { value: number; script: Buffer };
    tapInternalKey?: Buffer;
  };
  utxo: UTXO;
}

export const internalWallet = {
  'address': 'bc1p64lgtass0du6jfkaeslfmfs7t34lehwrya56xuu84zjtz37wnkdqgzl60f',
  'path': 'm/44\'/0\'/0\'/1/0',
  'WIF': 'L1NstttD9o7ssouMCzgMymwaWFYpNnq7WzkEP32MRdpDd4EKvqKP',
};

export class LocalWallet {
  keyPair: ECPairInterface;
  address: string;
  pubkey: string;
  network: bitcoin.Network;

  constructor(
    wif: string,
    networkType: NetworkType = NetworkType.TESTNET,
    addressType: AddressType = AddressType.P2WPKH,
  ) {
    const network = toPsbtNetwork(networkType);
    const keyPair = ECPair.fromWIF(wif, network);
    this.keyPair = keyPair;
    this.pubkey = keyPair.publicKey.toString('hex');
    this.address = publicKeyToAddress(this.pubkey, addressType, networkType);
    this.network = network;
  }

  signPsbt(psbt: bitcoin.Psbt, opts?: SignOptions) {
    const _opts = opts || {
      autoFinalized: true,
    };

    const psbtNetwork = this.network;
    const toSignInputs: ToSignInput[] = [];

    psbt.data.inputs.forEach((v, index) => {
      let script: any = null;
      if (v.witnessUtxo) {
        script = v.witnessUtxo.script;
      } else if (v.nonWitnessUtxo) {
        const tx = bitcoin.Transaction.fromBuffer(v.nonWitnessUtxo);
        const output = tx.outs[psbt.txInputs[index].index];
        script = output.script;
      }
      const isSigned = v.finalScriptSig || v.finalScriptWitness;
      if (script && !isSigned) {
        if (this.address === bitcoin.address.fromOutputScript(script, psbtNetwork)) {
          toSignInputs.push({
            index,
            publicKey: this.pubkey,
            sighashTypes: v.sighashType ? [v.sighashType] : undefined,
          });
        }
      }
    });

    const _inputs = _opts.inputs || toSignInputs;
    if (_inputs.length == 0) {
      throw new Error('no input to sign');
    }
    _inputs.forEach((input) => {
      const keyPair = this.keyPair;
      if (isTaprootInput(psbt.data.inputs[input.index])) {
        const signer = tweakSigner(keyPair, opts);
        psbt.signInput(input.index, signer, input.sighashTypes);
      } else {
        const signer = keyPair;
        psbt.signInput(input.index, signer, input.sighashTypes);
      }
      if (_opts.autoFinalized !== false) {
        // psbt.validateSignaturesOfInput(input.index, validator);
        psbt.finalizeInput(input.index);
      }
    });
    return psbt;
  }

  getPublicKey() {
    return this.keyPair.publicKey.toString('hex');
  }
}
