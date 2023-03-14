import {
    Dataset,
    Dimension,
    FileStatusInterface,
    CSVBody,
    CsvToJson,
    FileStatus,
    IEvent,
    Pipeline,
    Result
} from '../interfaces/Ingestion-data';
import {
    Body,
    Controller, FileTypeValidator,
    Get,
    MaxFileSizeValidator,
    ParseFilePipe,
    Post,
    Query,
    Res,
    UploadedFile,
    UseInterceptors,
    Put,
    UseGuards
} from '@nestjs/common';
import {DatasetService} from '../services/dataset/dataset.service';
import {DimensionService} from '../services/dimension/dimension.service';
import {EventService} from '../services/event/event.service';
import {PipelineService} from '../services/pipeline/pipeline.service';
import {Response} from 'express';
import {CsvImportService} from "../services/csvImport/csvImport.service";
import {FileInterceptor} from "@nestjs/platform-express";
import {diskStorage} from "multer";
import {FileIsDefinedValidator} from "../validators/file-is-defined-validator";
import {FileStatusService} from '../services/file-status/file-status.service';
import {UpdateFileStatusService} from '../services/update-file-status/update-file-status.service';
import {ApiConsumes, ApiTags} from '@nestjs/swagger';
import {DatabaseService} from '../../database/database.service';
import { CsvToJsonService } from '../services/csv-to-json/csv-to-json.service';
import {GenericFunction} from '../services/generic-function';
import { JwtGuard } from 'src/guards/jwt.guard';
import * as jwt from 'jsonwebtoken';
import { catchError } from 'rxjs';
@ApiTags('ingestion')
@Controller('')
export class IngestionController {
    constructor(
        private datasetservice: DatasetService, private dimesionService: DimensionService
        , private eventService: EventService, private pipelineService: PipelineService, private csvImportService: CsvImportService
        , private filestatus: FileStatusService, private updateFileStatus: UpdateFileStatusService, private databaseService: DatabaseService,private csvToJson:CsvToJsonService) {
    }

    @Get('generatejwt')
    testJwt( @Res() res: Response):any {
        let jwtSecretKey = process.env.JWT_SECRET;
        let data = {
            time: Date(),
        }
        try{
        const token: string = jwt.sign(data, jwtSecretKey);
        if(token)
        {
            res.status(200).send(token)
        }
        else{
            res.status(400).send("Could not generate token");
        }

        }catch(error){
            res.status(400).send("Error Ocurred");
        }

    }

    @Post('/query')
    async executeQuery(@Body() body: any, @Res() response: Response) {
        try {
            let result = await this.databaseService.executeQuery(body?.query);
            response.status(200).send(result)
        }
        catch (e) {
            console.error('execute-query-impl: ', e.message);
            response.status(500).send("Error running SQL query: " + e.message)
            throw new Error(e);
        }
    }

    @Post('/dataset')
    @UseGuards(JwtGuard)
    async createDataset(@Body() inputData: Dataset, @Res()response: Response) {
        try {
            let result: Result = await this.datasetservice.createDataset(inputData);
            if (result.code == 400) {
                response.status(400).send({"message": result.error});
            } else {
                response.status(200).send({
                    "message": result.message, invalid_record_count: result.errorCounter,
                    valid_record_count: result.validCounter
                });
            }
        }
        catch (e) {
            console.error('create-dataset-impl: ', e.message);
            throw new Error(e);
        }
    }

    @Post('/dimension')
    @UseGuards(JwtGuard)
    async createDimenshion(@Body() inputData: Dimension, @Res()response: Response) {
        try {
            let result: Result = await this.dimesionService.createDimension(inputData);
            if (result.code == 400) {
                response.status(400).send({"message": result.error});
            } else {
                response.status(200).send({
                    "message": result.message, invalid_record_count: result.errorCounter,
                    valid_record_count: result.validCounter
                });
            }
        } catch (e) {
            console.error('create-dimension-impl: ', e.message);
            throw new Error(e);
        }
    }

    @Post('/event')
    @UseGuards(JwtGuard)
    async createEvent(@Body() inputData: IEvent, @Res()response: Response) {
        try {
            let result: Result = await this.eventService.createEvent(inputData);
            if (result.code == 400) {
                response.status(400).send({"message": result.error});
            } else {
                response.status(200).send({
                    "message": result.message, invalid_record_count: result.errorCounter,
                    valid_record_count: result.validCounter
                });
            }
        } catch (e) {
            console.error('create-event-impl: ', e.message);
            throw new Error(e);
        }
    }

    @Post('/pipeline')
    async pipeline(@Body() pipelineData: Pipeline, @Res()response: Response) {
        try {
            let result = await this.pipelineService.pipeline(pipelineData);
            if (result.code == 400) {
                response.status(400).send({"message": result.error});
            } else {
                response.status(200).send({"message": result.message});
            }
        }
        catch (e) {
            console.error('create-pipeline-impl: ', e.message);
            throw new Error(e);
        }
    }

    @UseInterceptors(FileInterceptor('file', {
        storage: diskStorage({
            destination: './files',
        })
    }))
    @Post('/csv')
    @UseGuards(JwtGuard)
    @ApiConsumes('multipart/form-data')
    async csv(@Body() body: CSVBody, @Res()response: Response, @UploadedFile(
        new ParseFilePipe({
            validators: [
                new FileIsDefinedValidator(),
                new FileTypeValidator({fileType: 'text/csv'}),
            ],
        }),
    ) file: Express.Multer.File) {
        try {
            let result = await this.csvImportService.readAndParseFile(body, file);
            if (result.code == 400) {
                response.status(400).send({message: result.error});
            } else {
                response.status(200).send({message: result.message});
            }
        } catch (e) {
            console.error('ingestion.controller.csv: ', e);
            response.status(400).send({message: e.error || e.message});
            // throw new Error(e);
        }
    }

    @Get('/file-status')
    @UseGuards(JwtGuard)
    async getFileStatus(@Query() query: FileStatus, @Res()response: Response) {
        try {
            let result: any = await this.filestatus.getFileStatus(query);
            if (result.code == 400) {
                response.status(400).send({"message": result.error});
            } else {
                response.status(200).send({"response": result.response});
            }
        }
        catch (e) {
            console.error('get-filestatus-impl: ', e.message);
            throw new Error(e);
        }
    }

    @Put('/file-status')
    @UseGuards(JwtGuard)
    async updateFileStatusService(@Body() inputData: FileStatusInterface, @Res()response: Response) {
        try {
            let result: any = await this.updateFileStatus.UpdateFileStatus(inputData);
            if (result.code == 400) {
                response.status(400).send({"message": result.error});
            } else {
                response.status(200).send({"message": result.message, "ready_to_archive": result.ready_to_archive});
            }
        }
        catch (e) {
            console.error('ingestion.controller.updateFileStatusService: ', e.message);
            throw new Error(e);
        }
    }

    @Get('/metric')
    async csvtoJson(@Res()response: Response) {
        try {
            let result = await this.csvToJson.convertCsvToJson();
            if (result.code == 400) {
                response.status(400).send({message: result.error});
            } else {
                response.status(200).send({message: result.message,data:result.response});
            }
        } catch (e) {
            console.error('ingestion.controller.csvtojson: ', e);
            response.status(400).send({message: e.error || e.message});
        }
    }
}
