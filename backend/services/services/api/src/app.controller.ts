import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @Public()
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('ready')
  @Public()
  getReadiness() {
    return this.appService.getReadiness();
  }
}
