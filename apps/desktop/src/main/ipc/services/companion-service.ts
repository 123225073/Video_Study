import type { CompanionPairingInfo } from '@shared/companion-types'
import { type IpcContext, IpcMethod, IpcService } from 'electron-ipc-decorator'
import { getCompanionPairingInfo, resetCompanionPairings } from '../../local-api'

class CompanionService extends IpcService {
  static readonly groupName = 'companion'

  @IpcMethod()
  getPairingInfo(_context: IpcContext): CompanionPairingInfo {
    return getCompanionPairingInfo()
  }

  @IpcMethod()
  resetPairings(_context: IpcContext): CompanionPairingInfo {
    return resetCompanionPairings()
  }
}

export { CompanionService }
