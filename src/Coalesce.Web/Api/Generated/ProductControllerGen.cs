﻿
using Coalesce.Web.Models;
using IntelliTect.Coalesce;
using IntelliTect.Coalesce.Api;
using IntelliTect.Coalesce.Data;
using IntelliTect.Coalesce.Mapping;
using IntelliTect.Coalesce.Mapping.IncludeTrees;
using IntelliTect.Coalesce.Models;
using IntelliTect.Coalesce.TypeDefinition;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Net;
using System.Threading.Tasks;

namespace Coalesce.Web.Api
{
    [Route("api/[controller]")]
    [Authorize]
    public partial class ProductController
    : LocalBaseApiController<Coalesce.Domain.Product, ProductDtoGen>
    {
        public ProductController(Coalesce.Domain.AppDbContext db) : base(db)
        {
        }


        [HttpGet("list")]
        [Authorize]
        public virtual Task<ListResult<ProductDtoGen>> List(ListParameters parameters, IDataSource<Coalesce.Domain.Product> dataSource)
            => ListImplementation(parameters, dataSource);

        [HttpGet("count")]
        [Authorize]
        public virtual Task<int> Count(FilterParameters parameters, IDataSource<Coalesce.Domain.Product> dataSource)
            => CountImplementation(parameters, dataSource);

        [HttpGet("propertyValues")]
        [Authorize]
        public virtual IEnumerable<string> PropertyValues(string property, int page = 1, string search = "")
            => PropertyValuesImplementation(property, page, search);

        [HttpGet("get/{id}")]
        [Authorize]
        public virtual Task<ProductDtoGen> Get(int id, DataSourceParameters parameters, IDataSource<Coalesce.Domain.Product> dataSource)
            => GetImplementation(id, parameters, dataSource);


        [HttpPost("delete/{id}")]
        [Authorize]
        public virtual Task<ItemResult> Delete(int id, IBehaviors<Coalesce.Domain.Product> behaviors)
            => DeleteImplementation(id, behaviors);


        [HttpPost("save")]
        [Authorize(Roles = "Admin")]
        public virtual async Task<ItemResult<ProductDtoGen>> Save(ProductDtoGen dto, [FromQuery] DataSourceParameters parameters, IDataSource<Coalesce.Domain.Product> dataSource, IBehaviors<Coalesce.Domain.Product> behaviors)
        {

            if (!dto.ProductId.HasValue && !ClassViewModel.SecurityInfo.IsCreateAllowed(User))
            {
                Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                return "Create not allowed on Product objects.";
            }
            else if (dto.ProductId.HasValue && !ClassViewModel.SecurityInfo.IsEditAllowed(User))
            {
                Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                return "Edit not allowed on Product objects.";
            }

            return await SaveImplementation(dto, parameters, dataSource, behaviors);
        }

        [HttpPost("AddToCollection")]
        [Authorize(Roles = "Admin")]
        public virtual ItemResult<ProductDtoGen> AddToCollection(int id, string propertyName, int childId)
        {
            return ChangeCollection(id, propertyName, childId, "Add");
        }
        [HttpPost("RemoveFromCollection")]
        [Authorize(Roles = "Admin")]
        public virtual ItemResult<ProductDtoGen> RemoveFromCollection(int id, string propertyName, int childId)
        {
            return ChangeCollection(id, propertyName, childId, "Remove");
        }

        /// <summary>
        /// Downloads CSV of ProductDtoGen
        /// </summary>
        [HttpGet("csvDownload")]
        [Authorize]
        public virtual async Task<FileResult> CsvDownload(ListParameters parameters, IDataSource<Coalesce.Domain.Product> dataSource)
        {
            byte[] bytes = System.Text.Encoding.UTF8.GetBytes(await CsvText(parameters, dataSource));
            return File(bytes, "application/x-msdownload", "Product.csv");
        }

        /// <summary>
        /// Returns CSV text of ProductDtoGen
        /// </summary>
        [HttpGet("csvText")]
        [Authorize]
        public virtual async Task<string> CsvText(ListParameters parameters, IDataSource<Coalesce.Domain.Product> dataSource)
        {
            var listResult = await ListImplementation(parameters, dataSource);
            return IntelliTect.Coalesce.Helpers.CsvHelper.CreateCsv(listResult.List);
        }



        /// <summary>
        /// Saves CSV data as an uploaded file
        /// </summary>
        [HttpPost("CsvUpload")]
        [Authorize(Roles = "Admin")]
        public virtual async Task<IEnumerable<ItemResult>> CsvUpload(
            Microsoft.AspNetCore.Http.IFormFile file,
            IDataSource<Coalesce.Domain.Product> dataSource,
            IBehaviors<Coalesce.Domain.Product> behaviors,
            bool hasHeader = true)
        {
            if (file == null || file.Length == 0) throw new ArgumentException("No files uploaded");

            using (var stream = file.OpenReadStream())
            {
                using (var reader = new System.IO.StreamReader(stream))
                {
                    var csv = await reader.ReadToEndAsync();
                    return await CsvSave(csv, dataSource, behaviors, hasHeader);
                }
            }
        }

        /// <summary>
        /// Saves CSV data as a posted string
        /// </summary>
        [HttpPost("CsvSave")]
        [Authorize(Roles = "Admin")]
        public virtual async Task<IEnumerable<ItemResult>> CsvSave(
            string csv,
            IDataSource<Coalesce.Domain.Product> dataSource,
            IBehaviors<Coalesce.Domain.Product> behaviors,
            bool hasHeader = true)
        {
            // Get list from CSV
            var list = IntelliTect.Coalesce.Helpers.CsvHelper.ReadCsv<ProductDtoGen>(csv, hasHeader);
            var resultList = new List<ItemResult>();
            foreach (var dto in list)
            {
                // Check if creates/edits aren't allowed
                if (!dto.ProductId.HasValue && !ClassViewModel.SecurityInfo.IsCreateAllowed(User))
                {
                    Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    resultList.Add("Create not allowed on Product objects.");
                }
                else if (dto.ProductId.HasValue && !ClassViewModel.SecurityInfo.IsEditAllowed(User))
                {
                    Response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    resultList.Add("Edit not allowed on Product objects.");
                }
                else
                {
                    var parameters = new DataSourceParameters() { Includes = "none" };
                    var result = await SaveImplementation(dto, parameters, dataSource, behaviors);
                    resultList.Add(new ItemResult { WasSuccessful = result.WasSuccessful, Message = result.Message });
                }
            }
            return resultList;
        }

        // Methods from data class exposed through API Controller.
    }
}
