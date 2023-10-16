import { ElectrumApiInterface, IAtomicalBalanceSummary } from './interfaces/api';


export class AtomicalService {
  constructor(public electrumApi: ElectrumApiInterface) {}

  private async ensureService() {
    await this.electrumApi.resetConnection();
  }

  async open() {
    try {
      return await this.electrumApi.open();
    } catch (error) {
      throw 'socket open error';
    }
  }

  async close() {
    await this.electrumApi.close();
  }

  public reset() {
    this.electrumApi.reset();
  }

  async getBalanceSummary(atomicalId: string, address: string): Promise<IAtomicalBalanceSummary> {
    const res = await this.electrumApi.atomicalsByAddress(address);
    if (!res.atomicals[atomicalId]) {
      throw 'No Atomicals found for ' + atomicalId;
    }
    // console.log(JSON.stringify(res.atomicals[atomicalId], null, 2))
    // console.log(JSON.stringify(res.utxos, null, 2))
    const filteredUtxosByAtomical: any = [];
    for (const utxo of res.utxos) {
      if (utxo.atomicals.find((item: any) => item === atomicalId)) {
        filteredUtxosByAtomical.push({
          txid: utxo.txid,
          index: utxo.index,
          value: utxo.value,
          height: utxo.height,
          atomicals: utxo.atomicals
        });
      }
    }
    return {
      confirmed: res.atomicals[atomicalId].confirmed,
      type: res.atomicals[atomicalId].type,
      utxos: filteredUtxosByAtomical
    };
  }
}
