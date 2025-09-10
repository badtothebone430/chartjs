// ==UserScript==
// @name         SimCompanies Premium
// @namespace    http://tampermonkey.net/
// @version      3.3.5
// @description  Enhancements for SimCompanies web game. Complies with scripting rules of the game.
// @author       Loki Clarke
// @match        https://www.simcompanies.com/*
// @require      https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      simcotools.app
// @run-at       document-start
// @license MIT

// ==/UserScript==

(function () {
    "use strict";

    const CustomExchangeInputPrices = [10000]; // 交易所页面，自定义输入购买数量按钮
    const CustomProductionTimeInputs = ["9:15pm", "10pm", "6hr", "12hr","48hr","11am"]; // 生产页面，自定义输入生产时间按钮
    const ContractDiscount = 0.975; // 出售商品页面，合同MP价折扣
    const ECONST = 1.00259235256;
    let realCash = 0;
    let realPrice = 0;
    let flag = 0;

    let pageSpecifiedTimersList = [];
    let notesElement = null;
    let lastCompanyJson = null;

    let lastKnownURL = "";
    const mainCheckingURLLoop = () => {
        const currentURL = window.location.href;
        if (currentURL !== lastKnownURL) {
            handleURLChange(currentURL);
            lastKnownURL = currentURL;
        }
    };

    // Hook XMLHttpRequest https://www.simcompanies.com/api/v2/companies-by-company/0/XXXXXX/
    (function (open) {
        XMLHttpRequest.prototype.open = function () {
            this.addEventListener(
                "readystatechange",
                function () {
                    if (this.responseURL.indexOf("/companies-by-company/") != -1 && this.readyState === 4) {
                        const json = JSON.parse(this.response);
                        lastCompanyJson = json;
                    }
                },
                false
            );
            open.apply(this, arguments);
        };
    })(XMLHttpRequest.prototype.open);

    window.onload = () => {
        console.log("SimCompanies-Torn: onload");
        while (pageSpecifiedTimersList.length > 0) {
            clearInterval(pageSpecifiedTimersList.pop());
        }
        global_addCSS();
        global_addNavButtons();
        const currentURL = window.location.href;
        lastKnownURL = currentURL;
        handleURLChange(currentURL);
        setInterval(mainCheckingURLLoop, 1000);
    };

    function handleURLChange(currentURL) {
        console.log("SimCompanies-Torn: handleURLChange");
        while (pageSpecifiedTimersList.length > 0) {
            clearInterval(pageSpecifiedTimersList.pop());
        }
        if (currentURL.includes("/landscape/")) {
            handleLandscape();
        } else if (
            currentURL.includes("/warehouse/") &&
            currentURL !== "https://www.simcompanies.com/zh/headquarters/warehouse/" &&
            !currentURL.includes("/warehouse/incoming-contracts/") &&
            !currentURL.includes("/warehouse/outgoing-contracts/") &&
            !currentURL.includes("/warehouse/stats/") &&
            !currentURL.includes("/warehouse/research/")
        ) {
            flag = 0;
            handleWarehouseItem();
        } else if (/\/headquarters\/warehouse\/research\/.+/.test(currentURL)) {
            handleCustomButtonForOtherPage();
        } else if (currentURL.includes("/b/")) {
            handleCustomHourInput();
        } else if (currentURL.includes("/headquarters/executives/")) {
            // On the probability page
            const patentChance = getPatentProbability(); // from previous function
            if (patentChance !== null) {
                localStorage.setItem("patentProbability", patentChance);
            }

        } else if (currentURL.includes("/market/resource/")) {
            // 交易所 高亮6件最近访问物品
            handleExchangeHighlightRecent();
            // 交易所 自定义输入价格
            handleExchangeCustomInputPrices();
            console.log("onload: custom input prices");
        } else if (currentURL.includes("/company/0/") || currentURL.includes("/company/1/")) {
            // 公司资料页
            handleProfilePage();
        } else if (currentURL.includes("/market/building-auction/")) { console.log("auction detected");auction(); }
    }

    function handleSimcoToolsAPI() {
        const checkElementExist = () => {
            const selectedElem = document.querySelector(`input.css-1whp23o.form-control[name="quantity"]`);
            if (selectedElem) {
                clearInterval(timer);
                const parent = document.querySelector(`div.css-10klw3m.col-sm-8.col-xs-12`);
                let container = document.querySelector(`div#script_market_container`);
                if (!container) {
                    container = document.createElement("div");
                    container.id = "script_market_container";
                    container.style.padding = "0px 5px";
                    parent.insertBefore(container, parent.firstChild);
                } else {
                    container.innerHTML = "";
                }

                let realm = 0;
                if (document.querySelector(`div.css-inxa61.e1uuitfi4 img[alt*="企业家"]`)) {
                    realm = 1;
                }
                const array = window.location.href.split("/");
                let itemId = array[array.length - 2];
                console.log("SimCompanies-Torn: handleSimcoToolsAPI " + realm + " " + itemId);

                GM_xmlhttpRequest({
                    method: "GET",
                    url: `https://simcotools.app/api/v3/resources/${itemId}?realm=${realm}`,
                    headers: {
                        "Content-Type": "application/json",
                    },
                    onload: function (response) {
                        const json = JSON.parse(response.response);
                        const p = document.createElement("p");
                        let text =
                            "Latest Price: $" +
                            json.latest_price.toFixed(3) +
                            "<br>Average: $" +
                            json.prices_resume.average.toFixed(3) +
                            "&nbsp;&nbsp;&nbsp;Max: $" +
                            json.prices_resume.max.toFixed(3) +
                            "&nbsp;&nbsp;&nbsp;Min: $" +
                            json.prices_resume.min.toFixed(3);
                        p.innerHTML = text;
                        p.style.fontSize = "18px";
                        container.insertBefore(p, container.firstChild);
                    },
                });

                // Add chart
                GM_xmlhttpRequest({
                    method: "GET",
                    url: `https://simcotools.app/api/v3/resources/${itemId}/history?realm=${realm}&quality=null&date=&period=3&comparison=1`,
                    headers: {
                        "Content-Type": "application/json",
                    },
                    onload: function (response3) {
                        GM_xmlhttpRequest({
                            method: "GET",
                            url: `https://simcotools.app/api/v3/resources/${itemId}/records?realm=${realm}&quality=null&date=&period=1&comparison=previous`,
                            headers: {
                                "Content-Type": "application/json",
                            },
                            onload: function (response0) {
                                const json3 = JSON.parse(response3.response);
                                const json0 = JSON.parse(response0.response);
                                let dataThreeMonths = json3.history;
                                for (const record of json0.records) {
                                    record.average = record.price;
                                }
                                let dataOneDay = json0.records;
                                let dataOneMonth = [];
                                for (let i = dataThreeMonths.length - 1; i > dataThreeMonths.length - 31; i--) {
                                    dataOneMonth.push(dataThreeMonths[i]);
                                }

                                const div = document.createElement("div");
                                div.style.width = "100%";
                                div.style.height = "240px";
                                const canvas = document.createElement("canvas");
                                canvas.id = "script_market_canvas";
                                div.appendChild(canvas);
                                container.appendChild(div);
                                buildChart(canvas, [dataOneDay, dataOneMonth, dataThreeMonths]);
                            },
                        });
                    },
                });
            }
        };
        let timer = setInterval(checkElementExist, 100);
    }

    function buildChart(canvas, data) {
        new Chart(canvas, {
            type: "line",
            data: {
                datasets: [
                    {
                        label: "1 Day",
                        data: data[0],
                        pointRadius: 0,
                    },
                    {
                        label: "1 Month",
                        data: data[1],
                        pointRadius: 0,
                        hidden: true,
                    },
                    {
                        label: "3 Months",
                        data: data[2],
                        pointRadius: 0,
                        hidden: true,
                    },
                ],
            },
            options: {
                parsing: {
                    xAxisKey: "date",
                    yAxisKey: "average",
                },
                scales: {
                    x: {
                        type: "time",
                        time: {
                            tooltipFormat: "yyyy/MM/dd HH:mm",
                            displayFormats: {
                                day: "MM/dd",
                            },
                        },
                    },
                },
                plugins: {
                    legend: {
                        onClick: (e, legendItem, legend) => {
                            let index = legendItem.datasetIndex;
                            let ci = legend.chart;
                            ci.data.datasets.forEach(function (e, i) {
                                let meta = ci.getDatasetMeta(i);
                                if (i !== index) {
                                    meta.hidden = true;
                                } else {
                                    meta.hidden = false;
                                }
                            });
                            ci.update();
                        },
                    },
                },
            },
        });
    }

    function handleProfilePage() {
        const checkElementExist = () => {
            const selectedElems = document.querySelectorAll(`div.css-1156ixp.e1addz3e7 div.css-7ip5xj.e1addz3e6 div`);
            if (selectedElems.length > 10) {
                clearInterval(timer);
                let list = [];
                for (const elem of selectedElems) {
                    if (elem.querySelector(`span`)) {
                        list.push(elem.querySelector(`span`).querySelector(`span`).innerText);
                    }
                }
                const map = list.reduce((acc, e) => acc.set(e, (acc.get(e) || 0) + 1), new Map());
                const sortedMap = new Map([...map.entries()].sort((a, b) => b[1] - a[1]));
                let totalBuildingNum = 0;
                map.forEach((value) => {
                    totalBuildingNum += value;
                });
                let totalBuildingLevel = Number(document.querySelectorAll(`table.css-n6qpdi.et7yomk6`)[2].querySelectorAll(`tr`)[1].querySelectorAll(`td`)[1].innerHTML.replace(",", "")) / 100;
                let averageBuildingLevel = (totalBuildingLevel / totalBuildingNum).toFixed(1);

                const container = document.createElement("div");
                const div = document.createElement("div");
                const span = document.createElement("span");
                span.innerHTML = "建筑总数量: " + totalBuildingNum + "&emsp;总建筑等级: " + totalBuildingLevel + "&emsp;平均建筑等级: " + averageBuildingLevel;
                span.style.fontSize = "25px";
                span.style.padding = "5px 5px";
                span.style.background = "#FFC107";
                span.style.zIndex = "300";
                span.style.position = "relative";
                div.appendChild(span);
                container.appendChild(div);
                for (const [key, value] of sortedMap) {
                    const div = document.createElement("div");
                    const span = document.createElement("span");
                    span.innerHTML = key + " X " + value;
                    span.style.fontSize = "22px";
                    span.style.padding = "5px 5px";
                    span.style.background = "#FFC107";
                    span.style.zIndex = "300";
                    span.style.position = "relative";
                    div.appendChild(span);
                    container.appendChild(div);
                }
                const board = document.querySelector(`div.css-1156ixp.e1addz3e7 div.css-7ip5xj.e1addz3e6`);
                board.insertBefore(container, board.firstChild);

                // 移动展柜至下方
                const row = document.querySelector(`div.col-md-8 > div.row`);
                const target = row.querySelector(`div.col-sm-12`);
                if (target) {
                    target.parentNode.appendChild(target);
                }

                // API查询历史数据
                const id = lastCompanyJson.company.id;
                const name = lastCompanyJson.company.company;
                const level = lastCompanyJson.company.level;
                const realmId = lastCompanyJson.company.realmId;
                console.log("SimCompanies-Torn: handleProfilePage " + realmId + " " + id + " " + name);
                GM_xmlhttpRequest({
                    method: "GET",
                    url: `https://simcotools.app/api/v2/companies/${realmId}/${id}`,
                    headers: {
                        "Content-Type": "application/json",
                    },
                    onload: function (response) {
                        const valueList = JSON.parse(response.response).historical;
                        let average = 0;
                        let size = valueList.length > 7 ? 7 : valueList.length - 1;
                        for (let i = 0; i < size; i++) {
                            average += valueList[valueList.length - 1 - i].value - valueList[valueList.length - 2 - i].value;
                        }
                        average /= size;

                        const div = document.createElement("div");
                        const span = document.createElement("span");
                        span.innerHTML = name + " [" + id + "]&emsp;公司等级: " + level + "&emsp;近一周日均增长: $" + numberAddCommas(average.toFixed(0));
                        span.style.fontSize = "25px";
                        span.style.padding = "5px 5px";
                        span.style.background = "#FFC107";
                        span.style.zIndex = "300";
                        span.style.position = "relative";
                        div.appendChild(span);
                        container.insertBefore(div, container.firstChild);
                    },
                });
            }
        };
        let timer = setInterval(checkElementExist, 100);
    }

    function handleExchangeHighlightRecent() {
        const checkElementExist = () => {
            const selectedElems = document.querySelectorAll(`a.hover-effect.css-k8l72z`);
            if (selectedElems.length > 50) {
                const recentExchangeItemsString = localStorage.getItem("recentlyVisitedExchangeResources");
                const recentExchangeItems = JSON.parse(recentExchangeItemsString);
                for (const elem of selectedElems) {
                    elem.classList.remove("script-highlighted");
                }
                let markedNum = 0;
                for (const itemId of recentExchangeItems) {
                    if (markedNum < 6) {
                        markedNum++;
                        const target = document.querySelector(`div.css-hf83mx a.hover-effect.css-k8l72z[href*="/resource/${itemId}/"]`);
                        target.classList.add("script-highlighted");
                    }
                }
            }
        };
        const tempTimer = setInterval(checkElementExist, 1000);
        pageSpecifiedTimersList.push(tempTimer);
    }

    function handleExchangeCustomInputPrices() {
        const timer = setInterval(() => {
            const qtyInput = document.querySelector('input.form-control[name="quantity"]');
            if (!qtyInput) return;

            clearInterval(timer);

            CustomExchangeInputPrices.forEach(price => {
                const a = document.createElement("a");
                a.textContent = ` ${price} `;
                a.style.padding = "10px 5px";
                a.onclick = () => setInput(qtyInput, price);
                qtyInput.parentElement.parentElement.parentElement.appendChild(a);
            });

            const cashElem = document.querySelector('.css-q2xpdd');
            if (cashElem) {
                const cash = cashElem.textContent.trim();
                realCash = parseFloat(cash.replace('$','').replace(/,/g,'').trim());
                console.log(realCash);
            }
            const priceElem = document.querySelector('.css-fcl27u');
            if (priceElem) {
                const cheap = priceElem.textContent.trim();
                realPrice = parseFloat(cheap.replace('$','').replace(/,/g,'').trim());
                console.log(realPrice);
            }

            const price = Math.floor(realCash/realPrice);
            const half = Math.floor(price/2);

            const c = document.createElement("a");
            c.textContent = ` MAX: (${price})`;
            c.style.padding = "10px 5px";
            c.onclick = () => setInput(qtyInput, price);
            qtyInput.parentElement.parentElement.parentElement.appendChild(c);

            const b = document.createElement("a");
            b.textContent = ` 50% (${half})`;
            b.style.padding = "10px 5px";
            b.onclick = () => setInput(qtyInput, half);
            qtyInput.parentElement.parentElement.parentElement.appendChild(b);

            /*const array = window.location.href.split("/");
            let id = array[array.length - 2];
            console.log(`ID: ${id}`);

            let realm = 0;
            if (document.querySelector(`img[alt="Entrepreneurs realm logo"]`)) {
                realm = 1;
            }
            console.log(`Realm: ${realm}`);
          // Usually 0 for default realm
            */

            handleSimcoToolsAPI();
        }, 100);
    }

    function setInput(inputNode, value) {
        let lastValue = inputNode.value;
        inputNode.value = value;
        let event = new Event("input", { bubbles: true });
        event.simulated = true;
        if (inputNode._valueTracker) inputNode._valueTracker.setValue(lastValue);
        inputNode.dispatchEvent(event);
    }

    function handleCustomHourInput() {
        const checkElementExist = () => {
            const selectedElems = document.querySelectorAll("h3 > svg");
            let isReady = selectedElems.length > 0;
            if (isReady) {
                selectedElems.forEach((node) => {
                    isReady = isReady && node?.parentElement?.parentElement?.querySelector("div > button")?.parentElement;
                });
            }
            if (isReady) {
                clearInterval(timer);
                selectedElems.forEach((node) => {
                    let targetNode = node.parentElement.parentElement.querySelector("div > button").parentElement;
                    for (const text of CustomProductionTimeInputs) {
                        let newNode = document.createElement("button");
                        newNode.className = "script_custom_hour_button";
                        Object.assign(newNode, { type: "button", role: "button" });
                        newNode.onclick = (e) => {
                            let target_node = e.target.parentElement.parentElement.querySelector("input");
                            let target_text = e.target.innerText;
                            target_node.click();
                            setInput(target_node, target_text);
                            e.preventDefault();
                        };
                        let commonClass = targetNode.querySelector("button").className;
                        newNode.className += ` ${commonClass}`;
                        newNode.innerText = text;
                        targetNode.prepend(newNode);
                    }
                });
            }
        };
        let timer = setInterval(checkElementExist, 100);
    }

    function handleWarehouseItem() {
        const timer = setInterval(() => {
            clearInterval(timer); // Elements found—stop polling
            const input = document.querySelector('input.form-control[name="price"]');
            const priceElement = document.querySelector('.css-rnnx2x');
            const classArr = Array.from(document.querySelectorAll('.css-14is9qy'));

            if (!input || !priceElement || classArr.length < 2) return;



            const price = parseFloat(priceElement.nextSibling?.nextSibling?.textContent?.trim().replace(',', ''))?.toFixed(3);
            const source = parseFloat(classArr[1].textContent.trim().replace('$','').replace(',','')).toFixed(3);
            const amount = parseInt(classArr[0].textContent.trim().replace(',',''));

            console.log(`${price} ${source} ${amount}`);
            if(!flag){
                console.log(flag);
                const a = document.createElement('a');
                a.textContent = 'MP: $'+ price;
                a.style.display = "block";
                a.onclick = () => {setInput(input, price);}
                input.parentElement.appendChild(a);
                const a2 = document.createElement('a');
                a2.textContent = '2.5%: $'+ price*ContractDiscount;
                a2.style.display = "block";
                a2.onclick = () => {setInput(input, price*ContractDiscount);}
                input.parentElement.appendChild(a2);
                const span = document.createElement('span');
                const exchangeVal = (price*amount).toFixed(3);
                span.textContent = "Exchange Value: $"+exchangeVal;
                span.style.fontSize = "16px";
                span.style.padding = "10px 5px";
                span.style.display = "block";
                span.style.background = '#FFC107';
                span.style.border = '1px solid white';
                classArr[1].parentElement.appendChild(span);
                const span4 = document.createElement('span');
                span4.textContent = "Contract Value: $"+(price*amount*ContractDiscount).toFixed(3);
                span4.style.fontSize = "16px";
                span4.style.display = "block";
                classArr[1].parentElement.appendChild(span4);
                const span2 = document.createElement('span');
                span2.textContent = "Total Cost: $"+(source*amount).toFixed(3);
                span2.style.fontSize = "16px";
                span2.style.display = "block";
                classArr[1].parentElement.appendChild(span2);
                const span3 = document.createElement('span');
                const profitLow = ((price-source)*amount*.96).toFixed(3);
                const profitHigh = ((price-source)*amount*ContractDiscount).toFixed(3);
                const profitMargin = (profitLow/exchangeVal*100).toFixed(1);
                span3.textContent = "Profit Range: $"+profitLow+" - $"+profitHigh+`‎ ‎ ‎ ‎ (${profitMargin}% Profit)`;
                span3.style.fontSize = "16px";
                span3.style.display = "block";
                classArr[1].parentElement.appendChild(span3);

                flag=1;
                console.log(flag);
            }
        }, 100);
    }

    /*function handleWarehouseItem() {
        const checkElementExist = () => {
            const table = document.querySelector(`.css-1vwotq4.e12j7voa6`);
            const input = document.querySelector(`input[name="price"]`);
            const amountSpans = document.querySelectorAll(`div.css-81vhsj.e12j7voa12 span.css-14is9qy.e12j7voa17`);
            if (table && input && !input.classList.contains("script_checked")) {
                let exchangePrice = Number(table.querySelector("span.css-rnnx2x").nextSibling.nextSibling.textContent.replace(",", ""));
                let discountedPrice = exchangePrice * ContractDiscount;
                exchangePrice = exchangePrice.toFixed(3);
                discountedPrice = discountedPrice.toFixed(3);
                input.classList.add("script_checked");

                let elem = document.createElement("a");
                let linkText = document.createTextNode("Current MP = $" + exchangePrice);
                elem.appendChild(linkText);
                elem.onclick = () => {
                    setInput(input, exchangePrice);
                };
                elem.style.display = "block";
                input.parentNode.insertBefore(elem, input.nextSibling);

                let elem2 = document.createElement("a");
                let linkText2 = document.createTextNode("MP-" + ((1 - ContractDiscount) * 100).toFixed(1) + "% = $" + discountedPrice);
                elem2.appendChild(linkText2);
                elem2.onclick = () => {
                    setInput(input, discountedPrice);
                };
                elem2.style.display = "block";
                elem.parentNode.insertBefore(elem2, elem.nextSibling);

                if (document.querySelector(`h3.css-bi2xxi.e1bf4c272`).innerText === "收件方") {
                    setInput(input, discountedPrice);
                    elem2.style.background = "#FFC107";
                } else {
                    setInput(input, exchangePrice);
                    elem.style.background = "#FFC107";
                }
            } else if (table && input && input.classList.contains("script_checked") && !input.classList.contains("script_checked_2") && amountSpans[0].classList.contains("script_checked")) {
                let avg = Number(amountSpans[0].getAttribute("script-avg-mp").replace(",", ""));
                let discountedAvg = avg * ContractDiscount;
                avg = avg.toFixed(3);
                discountedAvg = discountedAvg.toFixed(3);
                input.classList.add("script_checked_2");

                let elem = document.createElement("a");
                let linkText = document.createTextNode("日均MP = $" + avg);
                elem.appendChild(linkText);
                elem.onclick = () => {
                    setInput(input, avg);
                };
                elem.style.display = "block";
                input.parentNode.appendChild(elem);

                let elem2 = document.createElement("a");
                let linkText2 = document.createTextNode("日均MP-" + ((1 - ContractDiscount) * 100).toFixed(0) + "% = $" + discountedAvg);
                elem2.appendChild(linkText2);
                elem2.onclick = () => {
                    setInput(input, discountedAvg);
                };
                elem2.style.display = "block";
                input.parentNode.appendChild(elem2);

                if (document.querySelector(`h3.css-bi2xxi.e1bf4c272`).innerText === "收件方") {
                    elem2.style.background = "#e3e3e3ff";
                } else {
                    elem.style.background = "#FFC107";
                }
            } else if (table && amountSpans.length >= 2 && !amountSpans[0].classList.contains("script_checked")) {
                amountSpans[0].classList.add("script_checked");
                let exchangePrice = Number(table.querySelector("span.css-rnnx2x").nextSibling.nextSibling.textContent.replace(",", ""));
                let discountedPrice = exchangePrice * 0.97;
                let itemAmount = Number(amountSpans[0].textContent.replace(",", ""));
                let totalValue = discountedPrice * itemAmount;
                totalValue = totalValue.toFixed(0);
                const newContainer = document.createElement("span");
                const newTextNode = document.createTextNode("(MP-3% Total Value: $" + numberAddCommas(totalValue) + ")");
                newContainer.appendChild(newTextNode);
                newContainer.style.background = "#FFC107";
                newContainer.style.fontSize = "18px";
                amountSpans[0].nextSibling.nextSibling.after(newContainer);

                const parent = document.querySelector(`div.css-1iegaby.e12j7voa18 > div.row`).children[1];
                let container = document.querySelector(`div#script_market_container`);
                if (!container) {
                    container = document.createElement("div");
                    container.id = "script_market_container";
                    container.style.padding = "0px 5px";
                    parent.insertBefore(container, parent.firstChild);
                } else {
                    container.innerHTML = "";
                }

                let realm = 0;
                if (document.querySelector(`div.css-inxa61.e1uuitfi4 img[alt*="企业家"]`)) {
                    realm = 1;
                }
                const array = table.parentNode.href.split("/");
                let itemId = array[array.length - 2];
                console.log("SimCompanies-Torn: handleSimcoToolsAPI " + realm + " " + itemId);

                GM_xmlhttpRequest({
                    method: "GET",
                    url: `https://simcotools.app/api/v3/resources/${itemId}?realm=${realm}`,
                    headers: {
                        "Content-Type": "application/json",
                    },
                    onload: function (response) {
                        const json = JSON.parse(response.response);
                        amountSpans[0].setAttribute("script-avg-mp", json.prices_resume.average.toFixed(3));
                        const p = document.createElement("p");
                        let text =
                            "当前: $" +
                            json.latest_price.toFixed(3) +
                            "<br>日均: $" +
                            json.prices_resume.average.toFixed(3) +
                            "&nbsp;&nbsp;&nbsp;最高: $" +
                            json.prices_resume.max.toFixed(3) +
                            "&nbsp;&nbsp;&nbsp;最低: $" +
                            json.prices_resume.min.toFixed(3);
                        p.innerHTML = text;
                        p.style.fontSize = "18px";
                        container.insertBefore(p, container.firstChild);
                    },
                });

                GM_xmlhttpRequest({
                    method: "GET",
                    url: `https://simcotools.app/api/v3/resources/${itemId}/history?realm=${realm}&quality=null&date=&period=3&comparison=1`,
                    headers: {
                        "Content-Type": "application/json",
                    },
                    onload: function (response3) {
                        GM_xmlhttpRequest({
                            method: "GET",
                            url: `https://simcotools.app/api/v3/resources/${itemId}/records?realm=${realm}&quality=null&date=&period=1&comparison=previous`,
                            headers: {
                                "Content-Type": "application/json",
                            },
                            onload: function (response0) {
                                const json3 = JSON.parse(response3.response);
                                const json0 = JSON.parse(response0.response);
                                let dataThreeMonths = json3.history;
                                for (const record of json0.records) {
                                    record.average = record.price;
                                }
                                let dataOneDay = json0.records;
                                let dataOneMonth = [];
                                for (let i = dataThreeMonths.length - 1; i > dataThreeMonths.length - 31; i--) {
                                    dataOneMonth.push(dataThreeMonths[i]);
                                }

                                const div = document.createElement("div");
                                div.style.width = "100%";
                                div.style.height = "240px";
                                const canvas = document.createElement("canvas");
                                canvas.id = "script_market_canvas";
                                div.appendChild(canvas);
                                container.appendChild(div);
                                buildChart(canvas, [dataOneDay, dataOneMonth, dataThreeMonths]);
                            },
                        });
                    },
                });
            }
        };
        const tempTimer = setInterval(checkElementExist, 500);
        pageSpecifiedTimersList.push(tempTimer);
    }*/

    function handleLandscape() {
        const checkElementExist = () => {
            if (document.getElementsByClassName("test-headquarters").length > 0) {
                clearInterval(timer);
                landscape_removeRush();
                landscape_highlightIdleBuildings();
                const tempTimer = setInterval(landscape_highlightIdleBuildings, 2000);
                pageSpecifiedTimersList.push(tempTimer);
                landscape_moveGatheringIcons();
                const tempTimer2 = setInterval(landscape_moveGatheringIcons, 2000);
                pageSpecifiedTimersList.push(tempTimer2);
            }
        };
        let timer = setInterval(checkElementExist, 100);
    }

    function landscape_moveGatheringIcons() {
        const icons = document.querySelectorAll("img.css-hqao0z.ejaaut33");
        for (const icon of icons) {
            if (!icon.classList.contains("script_moved_to_top_right")) {
                icon.classList.add("script_moved_to_top_right");
            }
        }
    }

    function landscape_removeRush() {
        const banners = document.querySelectorAll(".link-button.css-lgo4vi");
        for (const elm of banners) {
            elm.style.display = "none";
        }
    }

    function landscape_highlightIdleBuildings() {
        document.querySelectorAll('a[href*="/b/"] span.display-on-hover').forEach(sp => {
            if (sp.style.display === "block") {
                sp.querySelector("span").style.background = "#FFC107";
            }
        });
    }

    function global_addCSS() {
        GM_addStyle(`
        div.container.css-q9fi5t.ef8ljhx0 {
            width: 100% !important;
        }`);
        GM_addStyle(`
        div.container.css-q9fi5t.ef8ljhx0 .col-md-4:has(> :last-child:nth-child(1)) {
            width: 50% !important;
        }`);
        GM_addStyle(`
        div.container.css-q9fi5t.ef8ljhx0 .col-md-8:has(> :last-child:nth-child(1)) {
            width: 50% !important;
        }`);
        GM_addStyle(`
        div.css-1pbe8e5 div.col-xs-3.css-d2zl4q{
            width: 63px !important;
            padding-right: 2px !important;
            padding-left: 2px !important;
        }`);
        GM_addStyle(`
        .css-fbokx6 {
            width: 100% !important;
        }`);
        GM_addStyle(`
        div.css-1nu3wfe div.css-fbokx6.container .col-sm-4 {
            width: 50% !important;
        }`);
        GM_addStyle(`
        div.css-1nu3wfe div.css-fbokx6.container .col-sm-8 {
            width: 50% !important;
        }`);
        GM_addStyle(`
        .css-1luaoxw {
            display: block !important;
        }`);
        GM_addStyle(`
        h4.css-0 {
            margin-top: 3px !important;
            margin-bottom: 3px !important;
        }`);
        GM_addStyle(`
        h4.css-o7rt0f {
            margin-top: 3px !important;
            margin-bottom: 3px !important;
        }`);
        GM_addStyle(`
        .css-1a75jih {
            display: none !important;
        }`);
        GM_addStyle(`
        .script-nav-1 {
            margin-left: 50px;
            font-size: 18px;
            position: absolute;
            top: 50%;
            -ms-transform: translateY(-50%);
            transform: translateY(-50%);
            color: rgb(184,184,184);
        }`);
        GM_addStyle(`
        .script-nav-2 {
            margin-left: 100px;
            font-size: 18px;
            position: absolute;
            top: 50%;
            -ms-transform: translateY(-50%);
            transform: translateY(-50%);
            color: rgb(184,184,184);
        }`);
        GM_addStyle(`
        .script_moved_to_top_right {
            position:fixed !important;
            top:80% !important;
            border:1px solid black !important;
            z-index: 300 !important;
        }`);
        GM_addStyle(`
        .css-1tvnvpv {
            left: 5px !important;
            bottom: 5px !important;
            max-width: 350px !important;
            width: 100% !important;
            z-index: 300 !important;
        }`);
        GM_addStyle(`
        .css-lwisbd {
            height: 43px !important;
            margin-top: 2px !important;
        }`);
        GM_addStyle(`
        .chat-notifications .chat-notification img.logo {
            height: 33px !important;
            width: 33px !important;
        }`);
        GM_addStyle(`
        .script-highlighted {
            background-color: #FFC107 !important;
        }`);
        GM_addStyle(`
        .script-nav-3 {
            margin-left: 150px;
            font-size: 18px;
            position: absolute;
            top: 50%;
            -ms-transform: translateY(-50%);
            transform: translateY(-50%);
            color: rgb(184,184,184);
        }`);
        GM_addStyle(`
        textarea.script_notes {
            position:fixed;
            bottom:1%;
            right:1%;
            z-index: 200;
            font-size: 16px;
            background-color: #DCDCDC;
            max-width: 400px;
            max-height: 600px;
        }`);
        GM_addStyle(`
        div#script_market_container {
            width: 100%;
            height: 300px;
            background-color: #B2D7DA;
        }`);
        GM_addStyle(`
        a.css-s50znf > div.css-xgljd5 {
            visibility: hidden;
        }`);
    }

    function global_addNavButtons() {
        const checkElementExist = () => {
            if (document.querySelector(".css-145d0e.e1kr4hqh1")) {
                clearInterval(timer);
                setTimeout(function () {
                    const selectedElem = document.querySelector(".css-145d0e.e1kr4hqh1");
                    let a1 = document.createElement("a");
                    let linkText1 = document.createTextNode("文库");
                    a1.appendChild(linkText1);
                    a1.onclick = () => {
                        let targetButton = document.querySelector(`a[aria-label="文库"]`);
                        if (!targetButton) {
                            document.querySelector(`.css-1ljhlhi`).click();
                            targetButton = document.querySelector(`a[aria-label="文库"]`);
                        }
                        targetButton.click();
                    };
                    a1.classList.add("script-nav-1");
                    selectedElem.parentNode.insertBefore(a1, selectedElem.nextSibling);

                    let a2 = document.createElement("a");
                    let linkText2 = document.createTextNode("百科");
                    a2.appendChild(linkText2);
                    a2.onclick = () => {
                        let targetButton = document.querySelector(`a[aria-label="百科"]`);
                        if (!targetButton) {
                            document.querySelector(`.css-1ljhlhi`).click();
                            targetButton = document.querySelector(`a[aria-label="百科"]`);
                        }
                        targetButton.click();
                    };
                    a2.classList.add("script-nav-2");
                    selectedElem.parentNode.insertBefore(a2, selectedElem.nextSibling);

                    let a3 = document.createElement("a");
                    let linkText3 = document.createTextNode("[笔记]");
                    a3.appendChild(linkText3);
                    a3.onclick = () => {
                        handleNotes();
                    };
                    a3.classList.add("script-nav-3");
                    selectedElem.parentNode.insertBefore(a3, selectedElem.nextSibling);
                }, 500);
            }
        };
        let timer = setInterval(checkElementExist, 100);
    }

    function handleNotes() {
        if (!notesElement) {
            const notesString = localStorage.getItem("script_notes");
            notesElement = document.createElement("textarea");
            notesElement.classList.add("script_notes");
            notesElement.setAttribute("cols", "40");
            notesElement.setAttribute("rows", "10");
            notesElement.setAttribute("placeholder", "笔记内容本地保存，重要信息请另行备份");
            notesElement.style.display = "block";
            notesElement.value = notesString;
            notesElement.addEventListener(
                "input",
                () => {
                    localStorage.setItem("script_notes", notesElement.value);
                },
                false
            );
            document.body.appendChild(notesElement);
        } else if (notesElement.style.display === "none") {
            notesElement.style.display = "block";
        } else {
            notesElement.style.display = "none";
        }
    }

    function numberAddCommas(x) {
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    // Hollow function for a different page, similar structure to handleExchangeCustomInputPrices
    function handleCustomButtonForOtherPage() {
        const timer = setInterval(() => {
            const result = { patents: 0, total: 0, progress: 0, exchangeValue: null, itemId: null, chance: 0.0625 };

            const storedChance = parseFloat(localStorage.getItem("patentProbability"));
            if (!storedChance || isNaN(storedChance)) {
                alert("Please visit the Executives page first to load the patent probability.");
                result.chance = 0.0625; // fallback base value
                window.location.href = "https://www.simcompanies.com/headquarters/executives/";
            } else {
                result.chance = storedChance;
            }



            const patentTextEl = document.querySelector(".css-170aqo5.e1htbz258");
            const buyMoreEl = document.querySelector('a[href^="/market/resource/"]');
            const inputEl = document.querySelector(`input.form-control[name="amount"]`);

            // Wait until necessary elements exist
            if (!patentTextEl || !buyMoreEl || !inputEl) return;

            // --- Patents ---
            const match = patentTextEl.textContent.match(/([\d,]+)\s+patents\s+out\s+of\s+([\d,]+)/);
            if (!match) return;

            const patents = parseInt(match[1].replace(/,/g, ""), 10);
            const total = parseInt(match[2].replace(/,/g, ""), 10);
            const progress = total > 0 ? (patents / total) * 100 : 0;

            result.patents = patents;
            result.total = total;
            result.progress = progress;

            // --- Exchange value ---
            const priceMatch = buyMoreEl.textContent.match(/\(\$([\d.,]+)\)/);
            if (!priceMatch) return; // wait until price text exists
            result.exchangeValue = Number(priceMatch[1].replace(/,/g, ""));

            // --- Error correction for market price fluctation due to large volume ---
            result.exchangeValue *= ECONST; 
            

            // --- Item ID ---
            const hrefMatch = buyMoreEl.getAttribute("href").match(/\/market\/resource\/(\d+)\//);
            if (!hrefMatch) return;
            result.itemId = parseInt(hrefMatch[1], 10);

            const cashElem = document.querySelector('.css-q2xpdd');
            if (cashElem) {
                const cash = cashElem.textContent.trim();
                realCash = parseFloat(cash.replace('$','').replace(/,/g,'').trim());
                console.log(realCash);
            }


            // Clear interval since all data is ready
            clearInterval(timer);

            // --- Format numbers with commas ---
            const progressFormatted = progress.toFixed(2).toLocaleString();
            //const progressFormatted = Number(result.progress.toFixed(2)).toLocaleString();

            const require = ((total - patents) / result.chance).toFixed(0);
            const requireFormatted = Number(require).toLocaleString();
            const cashNeeded = (require * result.exchangeValue).toFixed(2);
            const cashNeededFormatted = Number(cashNeeded).toLocaleString();

            // --- Patent value dictionary ---
            const patentValueDict = {
                29: 1368,   // Plant
                30: 2160,   // Energy
                31: 2160,   // Mining
                32: 2592,   // Electronics
                33: 1584,   // Breeding
                34: 1296,   // Chemistry
                35: 1260,   // Software
                58: 1440,   // Automotive
                59: 720,    // Fashion
                100: 2440.8,// Aerospace
                113: 1800,  // Materials
                145: 1728   // Recipes
            };

            // --- Add title bar ---
            const titleBar = document.createElement("div");
            titleBar.textContent = "Executive Bypass";
            titleBar.style.fontWeight = "bold";
            titleBar.style.fontSize = "16px";
            titleBar.style.textAlign = "center";
            titleBar.style.marginBottom = "10px";
            inputEl.parentElement.insertBefore(titleBar, inputEl);


            // (Patent Progress, Research Needed, Cash Needed, Patent Conversion)


            // --- Patent Conversion ---
            const x = patentValueDict[result.itemId] || 0;
            console.log("require: ",require);
            console.log("cashNeeded: ",cashNeeded);
            const patentConversion = ((total-patents) * x) - cashNeeded;
            const patentConversionFormatted = Number(patentConversion).toLocaleString();

            console.log("Progress raw:", result.progress);
            console.log("Progress formatted:", progressFormatted);


            // --- Display progress ---
            const b = document.createElement("b");
            b.textContent = `Patent Progress: ${progressFormatted}%`;
            b.style.padding = '10px 5px';
            b.style.display = 'block';
            b.id = "patent-progress";
            b.dataset.version = "2.1.4";
            inputEl.parentElement.appendChild(b);

            // --- Display research needed ---
            const b2 = document.createElement("b");
            b2.textContent = `Research Needed: ${requireFormatted}`;
            b2.style.padding = '10px 5px';
            b2.style.display = 'block';
            inputEl.parentElement.appendChild(b2);

            // --- Display cash needed ---
            const b3 = document.createElement("b");
            b3.textContent = `Cash Needed: $${cashNeededFormatted}`;
            b3.style.padding = '10px 5px';
            b3.style.display = 'block';
            inputEl.parentElement.appendChild(b3);

            // --- Display patent conversion ---
            console.log("patentConversion: ", patentConversion);
            const b4 = document.createElement("b");
            const temp = (cashNeeded/patentConversion*100)-100;
            b4.textContent = `Patent Conversion: $${patentConversionFormatted}`;
            b4.style.padding = '10px 5px';
            b4.style.display = 'block';
            b4.style.color = patentConversion >= 0 ? 'green' : 'red';
            inputEl.parentElement.appendChild(b4);

            // --- Add note at bottom ---
            const note = document.createElement("div");
            note.textContent = `All of these calculations are estimates. They may vary. If you have executives, visit the Executives page then return here. (${temp}% Margin)`;
            note.style.fontSize = "12px";
            note.style.fontStyle = "italic";
            note.style.marginTop = "10px";
            inputEl.parentElement.appendChild(note);

            return result;

        }, 100); // check every 100ms until all elements and price exist
    }


    function getPatentProbability() {
        const rows = document.querySelectorAll("table.css-105i9tf.ewa4lx20 tbody tr");
        for (const row of rows) {
            const label = row.querySelector("td:first-child")?.textContent?.trim();
            if (label === "Patent probability") {
                const valueText = row.querySelector("td:last-child")?.textContent?.trim();
                if (!valueText) return null;

                // Match both numbers in the cell (e.g., "6.25% +3.94%")
                const matches = [...valueText.matchAll(/([\d.]+)%?/g)];
                if (matches.length === 0) return null;

                // Sum all percentages found
                let sum = 0;
                matches.forEach(m => sum += parseFloat(m[1]));
                console.log(sum);
                return sum / 100; // convert to decimal
            }
        }
        return null;
    }



    function auction() {
        const timer = setInterval (() => {
            console.log("qtyInput....");
            const qtyInput = document.querySelector('input.form-control[label="Bid"]');
            if (!qtyInput) return;
            console.log("qtyInput found");

            clearInterval(timer);

            const priceElem = Array.from(document.querySelectorAll('.css-2pg1ps'));
            if (priceElem) {
                const price = priceElem.find(el => el.textContent.includes('$')).textContent.trim();
                console.log(price);
                realPrice = parseFloat(price.replace('$','').replace(/,/g,'').trim());
                console.log(realPrice);
            }


            const a = document.createElement("button");
            a.textContent = `BYPASS BID`;
            a.style.padding = "10px 5px";
            a.onclick = () => setInput(qtyInput, realPrice);
            qtyInput.parentElement.appendChild(a);
        }, 100);

    }
})();
