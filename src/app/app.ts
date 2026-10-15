import { Component } from '@angular/core';
import { Explorer } from './explorer/explorer';

@Component({
  selector: 'app-root',
  imports: [Explorer],
  templateUrl: './app.html',
})
export class App {}
