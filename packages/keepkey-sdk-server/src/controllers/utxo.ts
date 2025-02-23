import {
  Body,
  Middlewares,
  OperationId,
  Post,
  Response,
  Route,
  Security,
  Tags,
} from '@tsoa/runtime'

import { ApiController } from '../auth'
import { extra } from '../middlewares'
import type * as types from '../types'

@Route('/utxo')
@Tags('UTXO')
@Security('apiKey')
@Middlewares(extra)
@Response(400, 'Bad request')
@Response(500, 'Error processing request')
export class UtxoController extends ApiController {
  /**
   * @summary Sign a UTXO transaction
   */
  @Post('sign-transaction')
  @OperationId('utxo_signTransaction')
  public async signTransaction(
    @Body()
    body: {
      coin: string
      inputs: any
      outputs: any
      vaultAddress?: string
      opReturnData?: string
    },
  ): Promise<{
    serializedTx: types.hex.bytes.Lower
  }> {
    let input: any = {
      coin: body.coin,
      inputs: body.inputs,
      outputs: body.outputs,
      version: 1,
      locktime: 0,
    }
    if (body.vaultAddress) input.vaultAddress = body.vaultAddress
    if (body.opReturnData) input.opReturnData = body.opReturnData
    if (input.coin === 'BitcoinCash') {
      for (let i = 0; i < input.outputs.length; i++) {
        let output = input.outputs[i]
        if (output.address && !output.address.startsWith('bitcoincash:')) {
          output.address = 'bitcoincash:' + output.address
        }
      }
    }

    return await this.context.wallet.btcSignTx(input)
  }
}
