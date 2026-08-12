export class MutationInProgressError extends Error {
  constructor() {
    super('Một thay đổi khác đang được lưu. Hãy chờ hoàn tất trước khi tiếp tục.')
    this.name = 'MutationInProgressError'
  }
}

export class MutationGate {
  private running = false

  async run<T>(action: () => Promise<T>): Promise<T> {
    if (this.running) throw new MutationInProgressError()
    this.running = true
    try {
      return await action()
    } finally {
      this.running = false
    }
  }
}
