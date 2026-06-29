import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  UploadedFile,
  BadRequestException,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import type {
  CreateBlogPostDto,
  UpdateBlogPostDto,
  CreateCommentDto,
} from "./blog.dto";
import { BlogService } from "./blog.service";
import { AdminGuard, Public } from "../auth";

interface BlogUploadFile {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
}

const createMemoryStorage =
  memoryStorage as unknown as () => import("multer").StorageEngine;

@Controller("blog")
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  @Public()
  async findAll(
    @Query("status") status?: "draft" | "published" | "archived" | "all",
    @Query("category") category?: string,
    @Query("tag") tag?: string,
    @Query("featured") featured?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.blogService.findAll({
      status,
      category,
      tag,
      featured: featured === "true",
      limit: limit ? Math.min(parseInt(limit, 10), 100) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get("categories")
  @Public()
  async getCategories() {
    return this.blogService.getCategories();
  }

  @Get("featured")
  @Public()
  async findFeatured() {
    return this.blogService.findAll({ featured: true, limit: 6 });
  }

  @Get(":id")
  @Public()
  async findOne(@Param("id") id: string) {
    return this.blogService.findOne(id);
  }

  @Get("slug/:slug")
  @Public()
  async findOneBySlug(@Param("slug") slug: string) {
    return this.blogService.findOneBySlug(slug);
  }

  @Post()
  @UseGuards(AdminGuard)
  async create(@Body() data: CreateBlogPostDto) {
    return this.blogService.create(data);
  }

  @Post("upload-image")
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor("file", { storage: createMemoryStorage() }))
  async uploadImage(@UploadedFile() file?: BlogUploadFile) {
    if (!file) {
      throw new BadRequestException("Image file is required");
    }

    return this.blogService.uploadImage(file);
  }

  @Put(":id")
  @UseGuards(AdminGuard)
  async update(@Param("id") id: string, @Body() data: UpdateBlogPostDto) {
    return this.blogService.update(id, data);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminGuard)
  async delete(@Param("id") id: string) {
    await this.blogService.delete(id);
  }

  @Get(":id/comments")
  @Public()
  async getComments(@Param("id") id: string) {
    return this.blogService.getComments(id);
  }

  @Post("comments")
  @Public()
  async addComment(@Body() data: CreateCommentDto) {
    return this.blogService.addComment(data);
  }

  @Put("comments/:commentId/moderate")
  @UseGuards(AdminGuard)
  async moderateComment(
    @Param("commentId") commentId: string,
    @Body("status") status: "approved" | "rejected",
  ) {
    return this.blogService.moderateComment(commentId, status);
  }

  @Post(":id/like")
  @HttpCode(HttpStatus.OK)
  @Public()
  async likePost(@Param("id") id: string) {
    return this.blogService.likePost(id);
  }
}
