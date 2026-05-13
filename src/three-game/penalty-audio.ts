export class PenaltyAudio {
  private readonly kick = this.loader("/kick.ogg");
  private readonly cheer = this.loader("/cheer.ogg");
  private readonly boo = this.loader("/boo.ogg");

  playKick(volume: number) {
    this.kick(volume);
  }

  playCheer(volume: number) {
    this.cheer(volume);
  }

  playBoo(volume: number) {
    this.boo(volume);
  }

  private loader(src: string) {
    const base = new Audio(src);
    base.preload = "auto";
    return (volume: number) => {
      const copy = base.cloneNode(true) as HTMLAudioElement;
      copy.volume = volume;
      copy.play().catch(() => {});
    };
  }
}
