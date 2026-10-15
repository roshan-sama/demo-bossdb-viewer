import { Component, inject, signal } from '@angular/core';
import { BossApi } from './boss/boss-api.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly api = inject(BossApi);
  protected readonly collections = signal<string[]>([]);
  protected readonly error = signal('');

  constructor() {
    this.api.collections().then((c) => this.collections.set(c)).catch((e) => this.error.set(e.message ?? String(e)));
  }
}
