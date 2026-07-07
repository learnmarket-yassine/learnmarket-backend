import { Module } from '@nestjs/common';
import { AnnoncesService } from './annonces.service';
import { AnnoncesController } from './annonces.controller';

@Module({
  providers: [AnnoncesService],
  controllers: [AnnoncesController],
  exports: [AnnoncesService],
})
export class AnnoncesModule {}
