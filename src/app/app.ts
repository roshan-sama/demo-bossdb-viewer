import { Component } from '@angular/core';
import { Explorer } from './explorer/explorer';
import { Footer } from './ui/footer/footer';

@Component({
  selector: 'app-root',
  imports: [Explorer, Footer],
  templateUrl: './app.html',
})
export class App {}
